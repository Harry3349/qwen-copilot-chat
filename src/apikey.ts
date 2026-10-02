/**
 * API key hygiene helpers.
 *
 * Keys are often pasted together with surrounding quotes or a full
 * `Authorization: Bearer …` header value. Those artifacts make an otherwise
 * valid key fail with `invalid_api_key`, so they are stripped before use.
 */

/** Structural description of an API key that never reveals the secret itself. */
export interface ApiKeyShape {
	/** Length after normalization. */
	readonly length: number;
	/** Matches the expected `sk-` + at least 20 characters layout. */
	readonly looksLikeDashScopeKey: boolean;
	/**
	 * Looks like a masked console value (`*`, `•`, `·`, `…` or `...`) rather than a
	 * real key. Consoles often display only part of the key; copying that text can
	 * never authenticate.
	 */
	readonly masked: boolean;
	readonly hadWhitespace: boolean;
	readonly hadQuotes: boolean;
	readonly hadBearerPrefix: boolean;
}

const SURROUNDING_QUOTES = new Set(['"', "'", '`']);

/** Characters consoles use to mask the hidden part of a key. */
const MASK_PATTERN = /[*\u2022\u00b7\u2026]|\.\.\./u;

/**
 * Removes paste artifacts: leading/trailing whitespace, a `Bearer ` prefix and
 * matched surrounding quotes (in any nesting order).
 */
export function normalizeApiKey(raw: string): string {
	let value = raw.trim();
	let previous = '';
	while (value !== previous) {
		previous = value;
		value = value.replace(/^bearer\s+/i, '').trim();
		if (value.length >= 2) {
			const first = value[0];
			const last = value[value.length - 1];
			if (SURROUNDING_QUOTES.has(first) && first === last) {
				value = value.slice(1, -1).trim();
			}
		}
	}
	return value;
}

/** Describes the shape of a raw key without exposing its content. */
export function describeApiKey(raw: string): ApiKeyShape {
	const trimmed = raw.trim();
	const normalized = normalizeApiKey(raw);
	return {
		length: normalized.length,
		looksLikeDashScopeKey: /^sk-[A-Za-z0-9._-]{20,}$/.test(normalized),
		masked: MASK_PATTERN.test(normalized),
		hadWhitespace: /\s/.test(trimmed),
		hadQuotes: SURROUNDING_QUOTES.has(trimmed[0] ?? '') || SURROUNDING_QUOTES.has(trimmed[trimmed.length - 1] ?? ''),
		hadBearerPrefix: /^bearer\s+/i.test(trimmed) || /^["'`]\s*bearer\s+/i.test(trimmed),
	};
}
