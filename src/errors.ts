/**
 * Error types and helpers that turn API failures into actionable messages.
 */

export class QwenRequestError extends Error {
	readonly status: number | undefined;
	readonly detail: string | undefined;

	constructor(message: string, status?: number, detail?: string) {
		super(message);
		this.name = 'QwenRequestError';
		this.status = status;
		this.detail = detail;
	}
}

/** Error thrown when no API key is configured. */
export function apiKeyMissingError(): QwenRequestError {
	return new QwenRequestError(
		'No Qwen API key configured. Run the command "Qwen: Set API Key" to add your Alibaba Cloud Model Studio key.',
	);
}

/** Status-specific guidance shown to the user. */
function hintForStatus(status: number, baseUrl: string): string | undefined {
	switch (status) {
		case 400:
			return 'The request was rejected. Check the selected model and the request options.';
		case 401:
		case 403:
			return 'Check your API key with "Qwen: Set API Key".';
		case 404:
			return `Check the base URL (${baseUrl}) and the API model ID.`;
		case 408:
			return 'The request timed out. Try again.';
		case 429:
			return 'Rate limit or quota exceeded. Wait and retry, or check your Model Studio quota.';
		default:
			return status >= 500 ? 'The Qwen service returned a server error. Try again later.' : undefined;
	}
}

/** Extracts a human readable message from an error response body. */
export function extractApiMessage(body: string): string | undefined {
	const trimmed = body.trim();
	if (!trimmed) {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(trimmed);
		if (parsed && typeof parsed === 'object') {
			const record = parsed as Record<string, unknown>;
			const nested = record['error'];
			if (nested && typeof nested === 'object') {
				const nestedRecord = nested as Record<string, unknown>;
				const message = typeof nestedRecord['message'] === 'string' ? nestedRecord['message'] : undefined;
				const code = typeof nestedRecord['code'] === 'string' ? nestedRecord['code'] : undefined;
				return [code, message].filter(Boolean).join(': ') || undefined;
			}
			const message = typeof record['message'] === 'string' ? record['message'] : undefined;
			const code = typeof record['code'] === 'string' ? record['code'] : undefined;
			return [code, message].filter(Boolean).join(': ') || undefined;
		}
	} catch {
		// Not JSON - fall through and use the raw text.
	}
	return trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed;
}

/** Builds a user facing error from a non-OK HTTP response. */
export async function createHttpError(response: Response, baseUrl: string): Promise<QwenRequestError> {
	let body = '';
	try {
		body = await response.text();
	} catch {
		// Ignore body read failures.
	}
	const statusLine = `${response.status} ${response.statusText}`.trim();
	const apiMessage = extractApiMessage(body);
	const hint = hintForStatus(response.status, baseUrl);
	const message = [`Qwen API request failed (${statusLine}).`, apiMessage, hint].filter(Boolean).join(' ');
	return new QwenRequestError(message, response.status, body.slice(0, 2000) || undefined);
}

/** Normalizes an unknown thrown value into a user facing `Error`. */
export function normalizeError(error: unknown, baseUrl: string): Error {
	if (error instanceof QwenRequestError) {
		return error;
	}
	if (error instanceof Error) {
		if (error.name === 'AbortError') {
			return error;
		}
		const cause = (error as { cause?: unknown }).cause;
		const causeMessage = cause instanceof Error ? cause.message : undefined;
		const message = causeMessage && causeMessage !== error.message ? `${error.message} (${causeMessage})` : error.message;
		return new QwenRequestError(`Failed to reach the Qwen API at ${baseUrl}. ${message}`);
	}
	return new QwenRequestError(`Failed to reach the Qwen API at ${baseUrl}. ${String(error)}`);
}
