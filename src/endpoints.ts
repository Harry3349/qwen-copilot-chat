import { DEFAULT_BASE_URL, INTERNATIONAL_BASE_URL } from './consts';

/** QwenCloud MaaS endpoint for a Token Plan subscription (OpenAI compatible). */
export const QWENCLOUD_TOKEN_PLAN_BASE_URL = 'https://token-plan.maas.qwencloudapi.com/compatible-mode/v1';

/** QwenCloud MaaS endpoint for Pay-As-You-Go billing (OpenAI compatible). */
export const QWENCLOUD_PAY_AS_YOU_GO_BASE_URL = 'https://maas.qwencloudapi.com/compatible-mode/v1';

/**
 * Endpoints that share one credential family.
 *
 * Only siblings of the same family are probed as fallbacks so that a user's API
 * key is never sent to an unrelated host that they did not configure.
 */
const ENDPOINT_FAMILIES: readonly (readonly EndpointCandidate[])[] = [
	[
		{ label: 'QwenCloud Token Plan', baseUrl: QWENCLOUD_TOKEN_PLAN_BASE_URL },
		{ label: 'QwenCloud Pay-As-You-Go', baseUrl: QWENCLOUD_PAY_AS_YOU_GO_BASE_URL },
	],
	[
		{ label: 'DashScope China (Beijing)', baseUrl: DEFAULT_BASE_URL },
		{ label: 'DashScope international (Singapore)', baseUrl: INTERNATIONAL_BASE_URL },
	],
];

export interface EndpointCandidate {
	/** Human readable region label, used in diagnostics output. */
	readonly label: string;
	readonly baseUrl: string;
}

function normalize(baseUrl: string): string {
	return baseUrl.trim().replace(/\/+$/, '');
}

function hostOf(baseUrl: string): string | undefined {
	try {
		return new URL(baseUrl).hostname.toLowerCase();
	} catch {
		return undefined;
	}
}

/**
 * Returns the sibling endpoints of the same credential family, or an empty list
 * for hosts that are not recognised (custom gateways and proxies).
 */
export function alternateFamilyEndpoints(baseUrl: string): EndpointCandidate[] {
	const host = hostOf(baseUrl);
	if (!host) {
		return [];
	}
	const family = ENDPOINT_FAMILIES.find((entries) => entries.some((entry) => hostOf(entry.baseUrl) === host));
	if (!family) {
		return [];
	}
	const normalized = normalize(baseUrl);
	return family.filter((entry) => normalize(entry.baseUrl) !== normalized);
}

/**
 * Endpoints to probe for a connection test: the configured endpoint first, then
 * the siblings of the same credential family. Keys are bound to a product or
 * region, so a key rejected by one endpoint often works with a sibling.
 */
export function endpointCandidates(configuredBaseUrl: string): EndpointCandidate[] {
	const configured = normalize(configuredBaseUrl) || DEFAULT_BASE_URL;
	return [{ label: 'configured', baseUrl: configured }, ...alternateFamilyEndpoints(configured)];
}
