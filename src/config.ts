import * as vscode from 'vscode';
import { CONFIG_SECTION, DEFAULT_BASE_URL } from './consts';
import type { DebugMode, ExtraModelDefinition, ModelInfoOverride } from './types';

function configuration(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

/** Base URL of the Qwen API, without a trailing slash. */
export function getBaseUrl(): string {
	const value = configuration().get<string>('baseUrl')?.trim();
	return value && value.length > 0 ? value : DEFAULT_BASE_URL;
}

/** API key configured in settings (plain-text fallback for automation). */
export function getSettingsApiKey(): string | undefined {
	const value = configuration().get<string>('apiKey')?.trim();
	return value && value.length > 0 ? value : undefined;
}

/** Maximum output tokens, or `undefined` to use the API default. */
export function getMaxTokens(): number | undefined {
	const value = configuration().get<number>('maxTokens', 0);
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

/** Sampling temperature, or `undefined` to use the API default. */
export function getTemperature(): number | undefined {
	const value = configuration().get<number>('temperature', -1);
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Whether previous reasoning content should be replayed on follow-up turns. */
export function getPreserveThinking(): boolean {
	return configuration().get<boolean>('preserveThinking', false);
}

/** Extra HTTP headers added to every request. */
export function getRequestHeaders(): Record<string, string> {
	const raw = configuration().get<Record<string, unknown>>('requestHeaders', {});
	const headers: Record<string, string> = {};
	if (!raw || typeof raw !== 'object') {
		return headers;
	}
	for (const [name, value] of Object.entries(raw)) {
		if (typeof value === 'string' && name.trim().length > 0) {
			headers[name.trim()] = value;
		}
	}
	return headers;
}

/** Model IDs the user wants to expose. Empty means "all built-in models". */
export function getEnabledModels(): string[] {
	const raw = configuration().get<unknown>('enabledModels', []);
	if (!Array.isArray(raw)) {
		return [];
	}
	return raw
		.filter((entry): entry is string => typeof entry === 'string')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

/** Per-model overrides keyed by model ID. */
export function getModelInfoOverrides(): Record<string, ModelInfoOverride> {
	const raw = configuration().get<Record<string, ModelInfoOverride>>('modelInfoOverrides', {});
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return {};
	}
	return raw;
}

/** Additional user-defined models. */
export function getExtraModels(): ExtraModelDefinition[] {
	const raw = configuration().get<unknown>('extraModels', []);
	if (!Array.isArray(raw)) {
		return [];
	}
	return raw.filter(
		(entry): entry is ExtraModelDefinition =>
			!!entry &&
			typeof entry === 'object' &&
			typeof (entry as ExtraModelDefinition).id === 'string' &&
			typeof (entry as ExtraModelDefinition).apiModel === 'string' &&
			typeof (entry as ExtraModelDefinition).name === 'string',
	);
}

/** Configured debug verbosity. */
export function getDebugMode(): DebugMode {
	const value = configuration().get<string>('debugMode', 'minimal');
	return value === 'metadata' || value === 'verbose' ? value : 'minimal';
}

/** Whether privacy-safe metadata should be logged. */
export function isDebugLoggingEnabled(): boolean {
	return getDebugMode() !== 'minimal';
}

/** Whether full request bodies should be logged. */
export function isVerboseLoggingEnabled(): boolean {
	return getDebugMode() === 'verbose';
}
