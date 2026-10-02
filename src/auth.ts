import * as vscode from 'vscode';
import { describeApiKey, normalizeApiKey } from './apikey';
import { getSettingsApiKey } from './config';
import { API_KEY_SECRET } from './consts';
import { logger } from './logger';

/**
 * Manages the Qwen API key.
 *
 * The key is stored in VS Code's SecretStorage. A plain-text setting is used as
 * a fallback so that CI / automation setups can inject the key via settings.
 */
export class AuthManager {
	constructor(private readonly secrets: vscode.SecretStorage) {}

	/** Returns the API key from SecretStorage or the settings fallback. */
	async getApiKey(): Promise<string | undefined> {
		const stored = await this.secrets.get(API_KEY_SECRET);
		const normalizedStored = stored ? normalizeApiKey(stored) : '';
		if (normalizedStored.length > 0) {
			return normalizedStored;
		}
		const settingsKey = getSettingsApiKey();
		if (!settingsKey) {
			return undefined;
		}
		const normalizedSettings = normalizeApiKey(settingsKey);
		return normalizedSettings.length > 0 ? normalizedSettings : undefined;
	}

	async hasApiKey(): Promise<boolean> {
		return (await this.getApiKey()) !== undefined;
	}

	async storeApiKey(apiKey: string): Promise<void> {
		const shape = describeApiKey(apiKey);
		await this.secrets.store(API_KEY_SECRET, normalizeApiKey(apiKey));
		if (shape.hadQuotes || shape.hadBearerPrefix || shape.hadWhitespace) {
			logger.info('Stripped paste artifacts (quotes, "Bearer " prefix or whitespace) from the Qwen API key.');
		}
		if (shape.masked) {
			logger.warn(
				'The stored Qwen API key contains masking characters ("*" or "..."). This is the partially hidden value shown in the console and can never authenticate - copy the full key instead.',
			);
		}
		if (!shape.looksLikeDashScopeKey) {
			logger.warn(
				`The stored Qwen API key does not look like a Model Studio key (length ${shape.length}, expected "sk-" followed by 20+ characters). Requests will fail with invalid_api_key if the key is wrong.`,
			);
		}
	}

	async deleteApiKey(): Promise<void> {
		await this.secrets.delete(API_KEY_SECRET);
	}

	/** Prompts the user for an API key and stores it. Returns true when saved. */
	async promptForApiKey(): Promise<boolean> {
		const apiKey = await vscode.window.showInputBox({
			title: 'Qwen API Key',
			prompt: 'Enter your Alibaba Cloud Model Studio (DashScope) API key. It starts with "sk-".',
			placeHolder: 'sk-...',
			password: true,
			ignoreFocusOut: true,
			validateInput: (value) => {
				const shape = describeApiKey(value ?? '');
				if (shape.length === 0) {
					return 'The API key must not be empty.';
				}
				if (shape.masked) {
					return 'This is the masked value shown in the console (it contains "*" or "..."). Use the copy button to copy the full key.';
				}
				return undefined;
			},
		});
		if (!apiKey) {
			return false;
		}
		await this.storeApiKey(apiKey);
		void vscode.window.showInformationMessage('Qwen API key saved.');
		return true;
	}
}
