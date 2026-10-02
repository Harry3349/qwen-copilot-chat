import * as vscode from 'vscode';
import { describeApiKey, type ApiKeyShape } from './apikey';
import { AuthManager } from './auth';
import { QwenClient } from './client';
import { getBaseUrl, getMaxTokens, getPreserveThinking, getRequestHeaders, getTemperature } from './config';
import { API_KEY_SECRET, CONFIG_SECTION, COPILOT_USAGE_DATA_PART_MIME, DEFAULT_CHARS_PER_TOKEN } from './consts';
import { convertMessages, convertTools, estimateTokenCount } from './convert';
import { diagnoseConnection, type ConnectionDiagnosis } from './diagnostics';
import { apiKeyMissingError } from './errors';
import { logger } from './logger';
import {
	THINKING_DESCRIPTIONS,
	THINKING_LABELS,
	findModelDefinition,
	resolveModelDefinitions,
	thinkingBudgetForEffort,
} from './models';
import type { ModelDefinition, QwenChatRequest, QwenToolCall, QwenUsage, ThinkingCapability, ThinkingEffort } from './types';

type ThinkingPartConstructor = new (value: string | string[]) => unknown;

/** Runtime-only part used to render a collapsible reasoning block. */
function getThinkingPartConstructor(): ThinkingPartConstructor | undefined {
	return (vscode as unknown as { LanguageModelThinkingPart?: ThinkingPartConstructor }).LanguageModelThinkingPart;
}

/**
 * Implements `vscode.LanguageModelChatProvider` so that Qwen models appear in
 * the GitHub Copilot Chat model picker.
 */
export class QwenChatProvider
	implements vscode.LanguageModelChatProvider<vscode.LanguageModelChatInformation>, vscode.Disposable
{
	private readonly auth: AuthManager;
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
	private readonly disposables: vscode.Disposable[] = [];
	private charsPerToken = DEFAULT_CHARS_PER_TOKEN;
	/** API model ID of the most recent chat request, used to test the right model. */
	private lastUsedApiModel: string | undefined;

	readonly onDidChangeLanguageModelChatInformation = this.onDidChangeEmitter.event;

	constructor(context: vscode.ExtensionContext) {
		this.auth = new AuthManager(context.secrets);
		this.disposables.push(
			this.onDidChangeEmitter,
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration(CONFIG_SECTION)) {
					this.refresh();
				}
			}),
			// SecretStorage changes do not fire onDidChangeConfiguration; keep other
			// windows in sync when the key is set or cleared elsewhere.
			context.secrets.onDidChange((event) => {
				if (event.key === API_KEY_SECRET) {
					this.refresh();
				}
			}),
		);
	}

	dispose(): void {
		for (const disposable of this.disposables.splice(0)) {
			disposable.dispose();
		}
	}

	/** Forces Copilot Chat to re-query the model list. */
	refresh(): void {
		this.onDidChangeEmitter.fire();
	}

	async configureApiKey(): Promise<void> {
		if (await this.auth.promptForApiKey()) {
			this.refresh();
		}
	}

	async clearApiKey(): Promise<void> {
		const clearAction = 'Clear API Key';
		const choice = await vscode.window.showWarningMessage(
			'Remove the stored Qwen API key?',
			{ modal: true, detail: 'You can add it again at any time with "Qwen: Set API Key".' },
			clearAction,
		);
		if (choice !== clearAction) {
			return;
		}
		await this.auth.deleteApiKey();
		this.refresh();
		void vscode.window.showInformationMessage('Qwen API key removed.');
	}

	/**
	 * Verifies endpoint and API key with a minimal request. Prefers the model the
	 * user last chatted with so the test reflects the selected model; when the key
	 * is rejected, the sibling endpoints of the same credential family are probed.
	 */
	async testConnection(): Promise<void> {
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Qwen: testing connection…', cancellable: true },
			async (_progress, cancellationToken) => {
				const apiKey = await this.auth.getApiKey();
				if (!apiKey) {
					const setKey = 'Set API Key';
					if ((await vscode.window.showErrorMessage('No Qwen API key configured.', setKey)) === setKey) {
						await this.configureApiKey();
					}
					return;
				}

				const model = this.lastUsedApiModel ?? resolveModelDefinitions()[0]?.apiModel ?? 'qwen3.8-flash';
				const configured = getBaseUrl();
				const abort = new AbortController();
				const listener = cancellationToken.onCancellationRequested(() => abort.abort());
				try {
					const diagnosis = await diagnoseConnection({
						configuredBaseUrl: configured,
						apiKey,
						model,
						signal: abort.signal,
					});
					await this.reportDiagnosis(diagnosis, model, describeApiKey(apiKey));
				} finally {
					listener.dispose();
				}
			},
		);
	}

	private async reportDiagnosis(
		diagnosis: ConnectionDiagnosis,
		model: string,
		keyShape: ApiKeyShape,
	): Promise<void> {
		const configuredResult = diagnosis.results[0];

		if (diagnosis.working && !diagnosis.recommendation) {
			void vscode.window.showInformationMessage(
				`Qwen connection OK — ${diagnosis.working.baseUrl} (test model: ${model}).`,
			);
			return;
		}

		if (diagnosis.recommendation) {
			const working = diagnosis.results.find((result) => result.kind === 'ok');
			const useIt = 'Use this endpoint';
			const choice = await vscode.window.showWarningMessage(
				`The API key was rejected by ${configuredResult.candidate.baseUrl} but works with ${diagnosis.recommendation} (${working?.candidate.label}). The key belongs to that endpoint.`,
				useIt,
			);
			if (choice === useIt) {
				await this.updateBaseUrl(diagnosis.recommendation);
			}
			return;
		}

		const allAuth = diagnosis.results.every((result) => result.kind === 'auth');
		if (allAuth) {
			logger.error(
				`Connection test failed: the API key was rejected by every probed region (key shape: length=${keyShape.length}, sk-prefix=${keyShape.looksLikeDashScopeKey}, whitespace=${keyShape.hadWhitespace}, quotes=${keyShape.hadQuotes}, bearerPrefix=${keyShape.hadBearerPrefix}).`,
			);
			const hint = authFailureHint(keyShape);
			const setKey = 'Set API Key';
			const choice = await vscode.window.showErrorMessage(
				`Qwen connection failed at every probed endpoint: invalid API key. ${hint}`,
				setKey,
			);
			if (choice === setKey) {
				await this.configureApiKey();
			}
			return;
		}

		const details = diagnosis.results
			.map(
				(result) =>
					`${result.candidate.baseUrl} → ${result.kind}${
						result.status ? ` (HTTP ${result.status})` : ''
					}: ${result.message}`,
			)
			.join(' | ');
		logger.error(`Connection test failed: ${details}`);
		void vscode.window.showErrorMessage(`Qwen connection failed. ${details}`);
	}

	private async updateBaseUrl(baseUrl: string): Promise<void> {
		const userTarget = 'User settings';
		const workspaceTarget = 'Workspace settings';
		const hasWorkspace = Boolean(vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.length);
		const choice = await vscode.window.showQuickPick(hasWorkspace ? [userTarget, workspaceTarget] : [userTarget], {
			title: 'Save the Qwen base URL in which settings?',
			placeHolder: baseUrl,
		});
		if (!choice) {
			return;
		}
		const target = choice === workspaceTarget ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
		try {
			await vscode.workspace.getConfiguration(CONFIG_SECTION).update('baseUrl', baseUrl, target);
			void vscode.window.showInformationMessage(`Qwen base URL set to ${baseUrl}.`);
			this.refresh();
		} catch (error) {
			logger.error('Failed to update the Qwen base URL.', error);
			void vscode.window.showErrorMessage('Could not save the Qwen base URL setting.');
		}
	}

	async provideLanguageModelChatInformation(
		_options: vscode.PrepareLanguageModelChatModelOptions,
		_token: vscode.CancellationToken,
	): Promise<vscode.LanguageModelChatInformation[]> {
		const hasApiKey = await this.auth.hasApiKey();
		return resolveModelDefinitions().map((model) => toChatInformation(model, hasApiKey));
	}

	async provideLanguageModelChatResponse(
		model: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		const apiKey = await this.auth.getApiKey();
		if (!apiKey) {
			throw apiKeyMissingError();
		}

		const definition = findModelDefinition(model.id) ?? fallbackDefinition(model);
		this.lastUsedApiModel = definition.apiModel;
		const baseUrl = getBaseUrl();
		const preserveThinking = getPreserveThinking();
		const converted = convertMessages(messages, definition, preserveThinking);
		const tools = convertTools(options.tools, definition);

		const maxTokens = getMaxTokens();
		const temperature = getTemperature();
		const effort = resolveThinkingEffort(options, definition);

		const request: QwenChatRequest = {
			model: definition.apiModel,
			messages: converted.messages,
			stream: true,
			...(tools
				? {
						tools,
						tool_choice: options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto',
					}
				: {}),
			...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
			...(temperature !== undefined ? { temperature } : {}),
			...(preserveThinking ? { preserve_thinking: true } : {}),
			...thinkingParameters(effort, definition),
		};

		const totalChars = converted.totalChars;
		const hasImages = converted.hasImages;
		const client = new QwenClient(baseUrl, apiKey, getRequestHeaders());

		await client.streamChatCompletion(
			request,
			{
				onContent: (text) => progress.report(new vscode.LanguageModelTextPart(text)),
				onThinking: (text) => reportThinking(progress, text),
				onToolCall: (toolCall) => reportToolCall(progress, toolCall),
				onUsage: (usage) => {
					if (!hasImages && totalChars > 0 && (usage.prompt_tokens ?? 0) > 0) {
						const observed = totalChars / (usage.prompt_tokens as number);
						this.charsPerToken = this.charsPerToken * 0.7 + observed * 0.3;
					}
					reportContextUsage(progress, usage);
				},
			},
			token,
		);
	}

	async provideTokenCount(
		_model: vscode.LanguageModelChatInformation,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken,
	): Promise<number> {
		return estimateTokenCount(text, this.charsPerToken);
	}
}

function toChatInformation(model: ModelDefinition, hasApiKey: boolean): vscode.LanguageModelChatInformation {
	const info: Record<string, unknown> = {
		id: model.id,
		name: model.name,
		family: model.family,
		version: model.version,
		detail: hasApiKey ? model.detail : 'API key required',
		tooltip: hasApiKey ? model.tooltip ?? model.detail : 'Run "Qwen: Set API Key" to use this model.',
		maxInputTokens: model.maxInputTokens,
		maxOutputTokens: model.maxOutputTokens,
		capabilities: {
			toolCalling: model.capabilities.toolCalling,
			imageInput: model.capabilities.imageInput,
		},
		isBYOK: true,
		isUserSelectable: true,
	};
	if (!hasApiKey) {
		info.statusIcon = new vscode.ThemeIcon('warning');
	}
	if (model.thinking) {
		info.configurationSchema = buildThinkingSchema(model.thinking);
	}
	return info as unknown as vscode.LanguageModelChatInformation;
}

function fallbackDefinition(info: vscode.LanguageModelChatInformation): ModelDefinition {
	return {
		id: info.id,
		apiModel: info.id,
		name: info.name,
		family: info.family,
		version: info.version,
		detail: info.detail ?? '',
		maxInputTokens: info.maxInputTokens,
		maxOutputTokens: info.maxOutputTokens,
		capabilities: {
			toolCalling: info.capabilities.toolCalling ?? true,
			imageInput: info.capabilities.imageInput ?? false,
		},
	};
}

function buildThinkingSchema(capability: ThinkingCapability): { properties: Record<string, unknown> } {
	const efforts: ThinkingEffort[] = [
		...(capability.canDisable && !capability.alwaysOn ? (['none'] as const) : []),
		...capability.supportedEfforts,
	];
	return {
		properties: {
			reasoningEffort: {
				type: 'string',
				title: 'Thinking',
				enum: efforts,
				enumItemLabels: efforts.map((effort) => THINKING_LABELS[effort] ?? effort),
				enumDescriptions: efforts.map((effort) => THINKING_DESCRIPTIONS[effort] ?? ''),
				default: capability.defaultEffort,
				group: 'navigation',
			},
		},
	};
}

function readConfiguredEffort(options: vscode.ProvideLanguageModelChatResponseOptions): unknown {
	const record = options as unknown as Record<string, unknown>;
	for (const key of ['modelOptions', 'modelConfiguration', 'configuration']) {
		const container = record[key];
		if (container && typeof container === 'object') {
			const value = (container as Record<string, unknown>)['reasoningEffort'];
			if (value !== undefined) {
				return value;
			}
		}
	}
	return undefined;
}

function resolveThinkingEffort(
	options: vscode.ProvideLanguageModelChatResponseOptions,
	definition: ModelDefinition,
): ThinkingEffort {
	const capability = definition.thinking;
	if (!capability) {
		return 'none';
	}
	const configured = readConfiguredEffort(options);
	if (configured === 'none') {
		return capability.canDisable && !capability.alwaysOn ? 'none' : capability.defaultEffort;
	}
	if (typeof configured === 'string' && (capability.supportedEfforts as readonly string[]).includes(configured)) {
		return configured as ThinkingEffort;
	}
	return capability.defaultEffort;
}

function thinkingParameters(
	effort: ThinkingEffort,
	definition: ModelDefinition,
): Pick<QwenChatRequest, 'enable_thinking' | 'thinking_budget'> {
	const capability = definition.thinking;
	if (!capability) {
		return {};
	}
	if (capability.alwaysOn) {
		return { enable_thinking: true };
	}
	if (effort === 'none') {
		return { enable_thinking: false };
	}
	const budget = thinkingBudgetForEffort(effort);
	return { enable_thinking: true, ...(budget !== undefined ? { thinking_budget: budget } : {}) };
}

function reportThinking(progress: vscode.Progress<vscode.LanguageModelResponsePart>, text: string): void {
	const ThinkingPart = getThinkingPartConstructor();
	if (!ThinkingPart) {
		// Older VS Code builds do not expose thinking parts; skip the reasoning text.
		return;
	}
	progress.report(new ThinkingPart(text) as unknown as vscode.LanguageModelResponsePart);
}

function reportToolCall(progress: vscode.Progress<vscode.LanguageModelResponsePart>, toolCall: QwenToolCall): void {
	let input: object = {};
	try {
		const parsed: unknown = JSON.parse(toolCall.function.arguments || '{}');
		if (parsed && typeof parsed === 'object') {
			input = parsed;
		}
	} catch {
		logger.debug(true, `Failed to parse arguments for tool ${toolCall.function.name}.`);
	}
	progress.report(new vscode.LanguageModelToolCallPart(toolCall.id, toolCall.function.name, input));
}

function authFailureHint(shape: ApiKeyShape): string {
	if (shape.masked) {
		return 'The stored key is the masked value shown in the console (it contains "*" or "..."). Use the copy button to copy the full key.';
	}
	if (!shape.looksLikeDashScopeKey) {
		return 'The key does not look like a Model Studio key (expected "sk-" followed by 20+ characters).';
	}
	return 'The key is well formed, but Model Studio rejected it - create a new key in the Model Studio console and set it again.';
}

function reportContextUsage(progress: vscode.Progress<vscode.LanguageModelResponsePart>, usage: QwenUsage): void {
	const data = {
		prompt_tokens: usage.prompt_tokens ?? 0,
		completion_tokens: usage.completion_tokens ?? 0,
		total_tokens: usage.total_tokens ?? 0,
		prompt_tokens_details: {
			cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
		},
	};
	try {
		const bytes = new TextEncoder().encode(JSON.stringify(data));
		progress.report(new vscode.LanguageModelDataPart(bytes, COPILOT_USAGE_DATA_PART_MIME));
	} catch (error) {
		logger.debug(true, 'Failed to report token usage to Copilot.', error);
	}
}
