import { resolveChatCompletionsUrl } from './client';
import { endpointCandidates, type EndpointCandidate } from './endpoints';
import { extractApiMessage } from './errors';
import { logger } from './logger';

/** Classification of a connection probe result. */
export type ProbeKind = 'ok' | 'auth' | 'quota' | 'request' | 'server' | 'dns' | 'network';

export interface ConnectionProbeResult {
	readonly candidate: EndpointCandidate;
	readonly kind: ProbeKind;
	readonly status?: number;
	readonly message: string;
}

export interface ConnectionDiagnosis {
	readonly results: ConnectionProbeResult[];
	/** Endpoint that answered successfully, if any. */
	readonly working?: EndpointCandidate;
	/** Base URL to switch to when the configured endpoint failed but another one worked. */
	readonly recommendation?: string;
}

/** Safety net so a stalled request cannot leave the progress notification spinning. */
const PROBE_TIMEOUT_MS = 20_000;

function classify(status: number): ProbeKind {
	if (status === 401 || status === 403) {
		return 'auth';
	}
	if (status === 429) {
		return 'quota';
	}
	if (status >= 500) {
		return 'server';
	}
	return 'request';
}

/** Error codes that mean "this hostname does not resolve". */
const DNS_ERROR_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ENODATA']);

function networkErrorCode(error: unknown): string | undefined {
	const cause = (error as { cause?: unknown }).cause;
	if (cause && typeof cause === 'object') {
		const code = (cause as { code?: unknown }).code;
		if (typeof code === 'string') {
			return code;
		}
	}
	return undefined;
}

/** Flattens `fetch failed` plus its underlying cause into a readable message. */
function describeNetworkError(error: unknown, code: string | undefined): string {
	const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
	const cause = (error as { cause?: unknown }).cause;
	const causeMessage = cause instanceof Error ? cause.message : cause ? String(cause) : undefined;
	const parts = causeMessage && causeMessage !== message ? [message, causeMessage] : [message];
	if (code && !parts.some((part) => part.includes(code))) {
		parts.push(code);
	}
	return parts.join(' / ');
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
	const timeout = AbortSignal.timeout(timeoutMs);
	if (!signal) {
		return timeout;
	}
	const any = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
	return any ? any([signal, timeout]) : signal;
}

/** Sends a minimal non-streaming request to verify endpoint and API key. */
export async function probeEndpoint(
	candidate: EndpointCandidate,
	apiKey: string,
	model: string,
	signal?: AbortSignal,
): Promise<ConnectionProbeResult> {
	const url = resolveChatCompletionsUrl(candidate.baseUrl);
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				messages: [{ role: 'user', content: 'ping' }],
				max_tokens: 1,
				stream: false,
			}),
			signal: combineSignals(signal, PROBE_TIMEOUT_MS),
		});

		if (response.ok) {
			return { candidate, kind: 'ok', status: response.status, message: 'OK' };
		}

		let body = '';
		try {
			body = await response.text();
		} catch {
			// Ignore body read failures.
		}
		return {
			candidate,
			kind: classify(response.status),
			status: response.status,
			message: extractApiMessage(body) ?? `${response.status} ${response.statusText}`,
		};
	} catch (error) {
		const code = networkErrorCode(error);
		return {
			candidate,
			kind: code && DNS_ERROR_CODES.has(code) ? 'dns' : 'network',
			message: describeNetworkError(error, code),
		};
	}
}

/**
 * Probes the configured endpoint and, when it fails on authentication, the
 * sibling endpoints of the same credential family.
 */
export async function diagnoseConnection(options: {
	configuredBaseUrl: string;
	apiKey: string;
	model: string;
	signal?: AbortSignal;
}): Promise<ConnectionDiagnosis> {
	const candidates = endpointCandidates(options.configuredBaseUrl);
	const results: ConnectionProbeResult[] = [];

	for (const candidate of candidates) {
		const result = await probeEndpoint(candidate, options.apiKey, options.model, options.signal);
		results.push(result);

		if (result.kind === 'ok') {
			logger.info(`Connection check OK: ${candidate.baseUrl} (model ${options.model})`);
			return {
				results,
				working: candidate,
				recommendation: candidate === candidates[0] ? undefined : candidate.baseUrl,
			};
		}

		logger.warn(`Connection check failed: ${candidate.baseUrl} -> ${result.kind}: ${result.message}`);

		// Only a rejected key hints at a wrong endpoint. Quota, request and server
		// errors would simply repeat elsewhere, and probing further hosts after a
		// network failure would only make the test slow.
		if (result.kind !== 'auth') {
			break;
		}
	}

	return { results };
}
