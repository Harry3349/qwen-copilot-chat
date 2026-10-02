/**
 * Shot-shared types used across the extension.
 *
 * Kept free of runtime imports so that every module can depend on it without
 * creating circular imports.
 */

/** Debug verbosity of the extension output channel. */
export type DebugMode = 'minimal' | 'metadata' | 'verbose';

/** Reasoning effort exposed in the Copilot model picker. */
export type ThinkingEffort = 'none' | 'low' | 'medium' | 'high';

/** Describes how a model's thinking mode can be controlled. */
export interface ThinkingCapability {
	/** Efforts that may be selected in the model picker. */
	readonly supportedEfforts: readonly Exclude<ThinkingEffort, 'none'>[];
	/** Effort used when the user has not selected one. */
	readonly defaultEffort: ThinkingEffort;
	/** Whether thinking can be disabled for this model. */
	readonly canDisable: boolean;
	/** When true the model always reasons; `enable_thinking` is not sent. */
	readonly alwaysOn?: boolean;
}

export interface ModelCapabilities {
	/** `false` disables tool calling, a number caps the tool count. */
	readonly toolCalling: boolean | number;
	readonly imageInput: boolean;
}

/** A model exposed through the language model chat provider. */
export interface ModelDefinition {
	/** Unique ID used by VS Code (also the default API model ID). */
	readonly id: string;
	/** Model ID sent to the API. */
	readonly apiModel: string;
	readonly name: string;
	readonly family: string;
	readonly version: string;
	readonly detail: string;
	readonly tooltip?: string;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;
	readonly capabilities: ModelCapabilities;
	readonly thinking?: ThinkingCapability;
}

/** User supplied tweaks for a single model (`qwen-copilot.modelInfoOverrides`). */
export interface ModelInfoOverride {
	apiModel?: string;
	name?: string;
	tooltip?: string;
	maxInputTokens?: number;
	maxOutputTokens?: number;
	imageInput?: boolean;
	toolCalling?: boolean | number;
	thinking?: boolean;
}

/** User supplied additional model (`qwen-copilot.extraModels`). */
export interface ExtraModelDefinition {
	id: string;
	apiModel: string;
	name: string;
	family?: string;
	version?: string;
	detail?: string;
	tooltip?: string;
	maxInputTokens?: number;
	maxOutputTokens?: number;
	imageInput?: boolean;
	toolCalling?: boolean | number;
	thinking?: boolean;
}

// ---------------------------------------------------------------------------
// Qwen / DashScope OpenAI-compatible wire format
// ---------------------------------------------------------------------------

export type QwenRole = 'system' | 'user' | 'assistant' | 'tool';

export interface QwenTextContentPart {
	readonly type: 'text';
	readonly text: string;
}

export interface QwenImageContentPart {
	readonly type: 'image_url';
	readonly image_url: { readonly url: string };
}

export type QwenContentPart = QwenTextContentPart | QwenImageContentPart;

export interface QwenToolCall {
	readonly id: string;
	readonly type: 'function';
	readonly function: { readonly name: string; readonly arguments: string };
}

export interface QwenMessage {
	readonly role: QwenRole;
	readonly content: string | QwenContentPart[];
	readonly reasoning_content?: string;
	readonly tool_calls?: QwenToolCall[];
	readonly tool_call_id?: string;
}

export interface QwenToolDefinition {
	readonly type: 'function';
	readonly function: {
		readonly name: string;
		readonly description: string;
		readonly parameters: object;
	};
}

export interface QwenUsage {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
	prompt_tokens_details?: { cached_tokens?: number };
	completion_tokens_details?: { reasoning_tokens?: number };
}

export interface QwenChatRequest {
	model: string;
	messages: QwenMessage[];
	stream: boolean;
	stream_options?: { include_usage: boolean };
	tools?: QwenToolDefinition[];
	tool_choice?: 'auto' | 'required' | 'none';
	max_tokens?: number;
	temperature?: number;
	enable_thinking?: boolean;
	thinking_budget?: number;
	preserve_thinking?: boolean;
}
