import { getEnabledModels, getExtraModels, getModelInfoOverrides } from './config';
import { MAX_TOOLS_PER_REQUEST } from './consts';
import type { ExtraModelDefinition, ModelDefinition, ModelInfoOverride, ThinkingCapability } from './types';

/**
 * Hybrid thinking models can be switched between thinking and non-thinking
 * per request via `enable_thinking`. The effort is mapped to `thinking_budget`.
 */
const HYBRID_THINKING: ThinkingCapability = {
	supportedEfforts: ['low', 'medium', 'high'],
	defaultEffort: 'medium',
	canDisable: true,
};

/**
 * Built-in Qwen models available through the DashScope OpenAI-compatible API.
 *
 * Context windows follow the Alibaba Cloud Model Studio documentation. Users
 * can adjust any value through `qwen-copilot.modelInfoOverrides`.
 */
export const BUILT_IN_MODELS: readonly ModelDefinition[] = [
	{
		id: 'qwen3.8-max',
		apiModel: 'qwen3.8-max',
		name: 'Qwen3.8 Max',
		family: 'qwen',
		version: '3.8',
		detail: 'Flagship reasoning · 1M context · vision',
		tooltip: 'Most capable Qwen model with thinking mode, vision and tool calling.',
		maxInputTokens: 1_000_000,
		maxOutputTokens: 65_536,
		capabilities: { toolCalling: MAX_TOOLS_PER_REQUEST, imageInput: true },
		thinking: HYBRID_THINKING,
	},
	{
		id: 'qwen3.7-plus',
		apiModel: 'qwen3.7-plus',
		name: 'Qwen3.7 Plus',
		family: 'qwen',
		version: '3.7',
		detail: 'Balanced coding · 1M context · vision',
		tooltip: 'Balanced cost and performance with a 1M token context window, thinking mode, vision and tool calling.',
		maxInputTokens: 1_000_000,
		maxOutputTokens: 65_536,
		capabilities: { toolCalling: MAX_TOOLS_PER_REQUEST, imageInput: true },
		thinking: HYBRID_THINKING,
	},
	{
		id: 'qwen3.8-flash',
		apiModel: 'qwen3.8-flash',
		name: 'Qwen3.8 Flash',
		family: 'qwen',
		version: '3.8',
		detail: 'Fast and low cost · 1M context',
		tooltip: 'Low-latency model with a 1M token context window, thinking mode and tool calling.',
		maxInputTokens: 1_000_000,
		maxOutputTokens: 65_536,
		capabilities: { toolCalling: MAX_TOOLS_PER_REQUEST, imageInput: false },
		thinking: HYBRID_THINKING,
	},
	{
		id: 'qwen3.7-flash',
		apiModel: 'qwen3.7-flash',
		name: 'Qwen3.7 Flash',
		family: 'qwen',
		version: '3.7',
		detail: 'Fast and low cost · 1M context',
		tooltip: 'Low-latency model with a 1M token context window, thinking mode and tool calling.',
		maxInputTokens: 1_000_000,
		maxOutputTokens: 65_536,
		capabilities: { toolCalling: MAX_TOOLS_PER_REQUEST, imageInput: false },
		thinking: HYBRID_THINKING,
	},
	{
		id: 'qwen3-coder-plus',
		apiModel: 'qwen3-coder-plus',
		name: 'Qwen3 Coder Plus',
		family: 'qwen',
		version: '3',
		detail: 'Optimized for code · 1M context',
		tooltip: 'Coding-focused model with a 1M token context window, thinking mode and tool calling.',
		maxInputTokens: 1_000_000,
		maxOutputTokens: 65_536,
		capabilities: { toolCalling: MAX_TOOLS_PER_REQUEST, imageInput: false },
		thinking: HYBRID_THINKING,
	},
	{
		id: 'qwen3.8-omni-flash',
		apiModel: 'qwen3.8-omni-flash',
		name: 'Qwen3.8 Omni Flash',
		family: 'qwen',
		version: '3.8',
		detail: 'Multimodal omni model · vision',
		tooltip: 'Multimodal model that understands text and images, with thinking mode and tool calling.',
		maxInputTokens: 262_144,
		maxOutputTokens: 32_768,
		capabilities: { toolCalling: MAX_TOOLS_PER_REQUEST, imageInput: true },
		thinking: HYBRID_THINKING,
	},
	{
		id: 'qwen3-vl-plus',
		apiModel: 'qwen3-vl-plus',
		name: 'Qwen3 VL Plus',
		family: 'qwen',
		version: '3',
		detail: 'Vision-language model',
		tooltip: 'Vision-language model for image understanding, with thinking mode and tool calling.',
		maxInputTokens: 262_144,
		maxOutputTokens: 32_768,
		capabilities: { toolCalling: MAX_TOOLS_PER_REQUEST, imageInput: true },
		thinking: HYBRID_THINKING,
	},
	{
		id: 'qwen-plus',
		apiModel: 'qwen-plus',
		name: 'Qwen Plus',
		family: 'qwen',
		version: 'latest',
		detail: 'General purpose · 1M context',
		tooltip: 'General-purpose model with a 1M token context window, thinking mode and tool calling.',
		maxInputTokens: 1_000_000,
		maxOutputTokens: 32_768,
		capabilities: { toolCalling: MAX_TOOLS_PER_REQUEST, imageInput: false },
		thinking: HYBRID_THINKING,
	},
	{
		id: 'qwen-max',
		apiModel: 'qwen-max',
		name: 'Qwen Max',
		family: 'qwen',
		version: 'latest',
		detail: 'Stable general purpose model',
		tooltip: 'Stable general-purpose model without thinking mode.',
		maxInputTokens: 131_072,
		maxOutputTokens: 8_192,
		capabilities: { toolCalling: MAX_TOOLS_PER_REQUEST, imageInput: false },
	},
	{
		id: 'qwen-turbo',
		apiModel: 'qwen-turbo',
		name: 'Qwen Turbo',
		family: 'qwen',
		version: 'latest',
		detail: 'Cheapest general purpose · 1M context',
		tooltip: 'Fast and inexpensive model with a 1M token context window, thinking mode and tool calling.',
		maxInputTokens: 1_000_000,
		maxOutputTokens: 32_768,
		capabilities: { toolCalling: MAX_TOOLS_PER_REQUEST, imageInput: false },
		thinking: HYBRID_THINKING,
	},
	{
		id: 'qwen-long',
		apiModel: 'qwen-long',
		name: 'Qwen Long',
		family: 'qwen',
		version: 'latest',
		detail: 'Ultra long context · 10M tokens',
		tooltip: 'Model for very long documents with a 10M token context window. No tool calling.',
		maxInputTokens: 10_000_000,
		maxOutputTokens: 8_192,
		capabilities: { toolCalling: false, imageInput: false },
	},
];

function isPositiveNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function cleanString(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function toModelDefinition(extra: ExtraModelDefinition): ModelDefinition {
	return {
		id: cleanString(extra.id) ?? 'qwen-custom',
		apiModel: cleanString(extra.apiModel) ?? cleanString(extra.id) ?? 'qwen-custom',
		name: cleanString(extra.name) ?? cleanString(extra.id) ?? 'Qwen Custom',
		family: cleanString(extra.family) ?? 'qwen',
		version: cleanString(extra.version) ?? '1',
		detail: cleanString(extra.detail) ?? 'Custom Qwen model',
		tooltip: cleanString(extra.tooltip),
		maxInputTokens: isPositiveNumber(extra.maxInputTokens) ? extra.maxInputTokens : 131_072,
		maxOutputTokens: isPositiveNumber(extra.maxOutputTokens) ? extra.maxOutputTokens : 8_192,
		capabilities: {
			toolCalling: extra.toolCalling ?? MAX_TOOLS_PER_REQUEST,
			imageInput: extra.imageInput ?? false,
		},
		thinking: extra.thinking ? HYBRID_THINKING : undefined,
	};
}

function applyOverride(model: ModelDefinition, override: ModelInfoOverride | undefined): ModelDefinition {
	if (!override) {
		return model;
	}
	const thinking =
		override.thinking === undefined ? model.thinking : override.thinking ? model.thinking ?? HYBRID_THINKING : undefined;
	return {
		...model,
		apiModel: cleanString(override.apiModel) ?? model.apiModel,
		name: cleanString(override.name) ?? model.name,
		tooltip: cleanString(override.tooltip) ?? model.tooltip,
		maxInputTokens: isPositiveNumber(override.maxInputTokens) ? override.maxInputTokens : model.maxInputTokens,
		maxOutputTokens: isPositiveNumber(override.maxOutputTokens) ? override.maxOutputTokens : model.maxOutputTokens,
		capabilities: {
			toolCalling: override.toolCalling ?? model.capabilities.toolCalling,
			imageInput: override.imageInput ?? model.capabilities.imageInput,
		},
		thinking,
	};
}

/**
 * Resolves the effective model list: built-in models plus user-defined extras,
 * with per-model overrides applied and the optional allow-list filtered.
 */
export function resolveModelDefinitions(): ModelDefinition[] {
	const overrides = getModelInfoOverrides();
	const extras = getExtraModels().map(toModelDefinition);

	const models: ModelDefinition[] = [];
	const seen = new Set<string>();
	for (const base of [...BUILT_IN_MODELS, ...extras]) {
		const resolved = applyOverride(base, overrides[base.id]);
		if (seen.has(resolved.id)) {
			continue;
		}
		seen.add(resolved.id);
		models.push(resolved);
	}

	const enabled = getEnabledModels().map((id) => id.toLowerCase());
	if (enabled.length === 0) {
		return models;
	}
	return models.filter((model) => enabled.includes(model.id.toLowerCase()));
}

/** Finds a resolved model by its VS Code ID. */
export function findModelDefinition(id: string): ModelDefinition | undefined {
	return resolveModelDefinitions().find((model) => model.id === id);
}

export const THINKING_LABELS: Record<string, string> = {
	none: 'Thinking off',
	low: 'Thinking: low',
	medium: 'Thinking: medium',
	high: 'Thinking: high',
};

export const THINKING_DESCRIPTIONS: Record<string, string> = {
	none: 'Answer directly without a reasoning pass.',
	low: 'Short reasoning budget, fastest responses.',
	medium: 'Balanced reasoning budget.',
	high: 'Large reasoning budget for complex tasks.',
};

/** Maps a thinking effort to the `thinking_budget` value sent to the API. */
export function thinkingBudgetForEffort(effort: string): number | undefined {
	switch (effort) {
		case 'low':
			return 1_024;
		case 'medium':
			return 4_096;
		case 'high':
			return 16_384;
		default:
			return undefined;
	}
}
