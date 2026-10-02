import * as vscode from 'vscode';
import { IMAGE_MIME_PREFIX, LANGUAGE_MODEL_CHAT_SYSTEM_ROLE, MAX_TOOLS_PER_REQUEST } from './consts';
import type {
	ModelDefinition,
	QwenContentPart,
	QwenMessage,
	QwenRole,
	QwenToolCall,
	QwenToolDefinition,
} from './types';

interface ThinkingPartLike {
	readonly value: string | string[];
}

type ThinkingPartConstructor = new (value: string | string[]) => ThinkingPartLike;

/**
 * `LanguageModelThinkingPart` is available at runtime but not part of the
 * published `vscode.d.ts`, so it is looked up dynamically and guarded.
 */
function getThinkingPartConstructor(): ThinkingPartConstructor | undefined {
	return (vscode as unknown as { LanguageModelThinkingPart?: ThinkingPartConstructor }).LanguageModelThinkingPart;
}

export function isThinkingPart(part: unknown): part is ThinkingPartLike {
	const ctor = getThinkingPartConstructor();
	return !!ctor && part instanceof (ctor as unknown as new (...args: never[]) => object);
}

function thinkingText(part: ThinkingPartLike): string {
	return Array.isArray(part.value) ? part.value.join('') : part.value;
}

function isImagePart(part: unknown): part is vscode.LanguageModelDataPart {
	return part instanceof vscode.LanguageModelDataPart && part.mimeType.toLowerCase().startsWith(IMAGE_MIME_PREFIX);
}

function toDataUrl(part: vscode.LanguageModelDataPart): string {
	return `data:${part.mimeType};base64,${Buffer.from(part.data).toString('base64')}`;
}

function safeStringify(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	try {
		return JSON.stringify(value) ?? '';
	} catch {
		return '';
	}
}

function mapRole(role: number): QwenRole {
	switch (role) {
		case vscode.LanguageModelChatMessageRole.Assistant:
			return 'assistant';
		case vscode.LanguageModelChatMessageRole.User:
			return 'user';
		case LANGUAGE_MODEL_CHAT_SYSTEM_ROLE:
			return 'system';
		default:
			return 'user';
	}
}

function contentCharLength(content: string | QwenContentPart[]): number {
	if (typeof content === 'string') {
		return content.length;
	}
	let total = 0;
	for (const part of content) {
		if (part.type === 'text') {
			total += part.text.length;
		}
	}
	return total;
}

function convertToolResult(
	part: vscode.LanguageModelToolResultPart,
	model: ModelDefinition,
): string | QwenContentPart[] {
	const texts: string[] = [];
	const images: QwenContentPart[] = [];

	for (const entry of part.content) {
		if (entry instanceof vscode.LanguageModelTextPart) {
			texts.push(entry.value);
		} else if (isImagePart(entry) && model.capabilities.imageInput) {
			images.push({ type: 'image_url', image_url: { url: toDataUrl(entry) } });
		} else if (entry instanceof vscode.LanguageModelPromptTsxPart) {
			// Prompt TSX parts cannot be represented in the OpenAI-compatible format.
			continue;
		} else if (typeof entry === 'string') {
			texts.push(entry);
		} else if (entry !== undefined && entry !== null) {
			const serialized = safeStringify(entry);
			if (serialized.length > 0) {
				texts.push(serialized);
			}
		}
	}

	if (images.length > 0) {
		return [...texts.map((text): QwenContentPart => ({ type: 'text', text })), ...images];
	}
	return texts.join('\n');
}

export interface ConvertedMessages {
	readonly messages: QwenMessage[];
	/** Approximate character count of the request, used to calibrate token counts. */
	readonly totalChars: number;
	/** Whether any image was forwarded to the API. */
	readonly hasImages: boolean;
}

/**
 * Converts VS Code chat messages into the Qwen (OpenAI-compatible) format.
 */
export function convertMessages(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	model: ModelDefinition,
	preserveThinking: boolean,
): ConvertedMessages {
	const result: QwenMessage[] = [];
	let totalChars = 0;
	let hasImages = false;
	const visionEnabled = model.capabilities.imageInput;

	for (const message of messages) {
		const role = mapRole(message.role);
		let text = '';
		let thinking = '';
		const userParts: QwenContentPart[] = [];
		const toolCalls: QwenToolCall[] = [];
		const toolResults: vscode.LanguageModelToolResultPart[] = [];

		for (const part of message.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				text += part.value;
				if (visionEnabled && role === 'user') {
					userParts.push({ type: 'text', text: part.value });
				}
			} else if (isThinkingPart(part)) {
				thinking += thinkingText(part);
			} else if (part instanceof vscode.LanguageModelToolCallPart) {
				toolCalls.push({
					id: part.callId,
					type: 'function',
					function: { name: part.name, arguments: safeStringify(part.input) },
				});
			} else if (part instanceof vscode.LanguageModelToolResultPart) {
				toolResults.push(part);
			} else if (isImagePart(part)) {
				if (visionEnabled && role === 'user') {
					userParts.push({ type: 'image_url', image_url: { url: toDataUrl(part) } });
					hasImages = true;
				}
			}
		}

		if (role === 'assistant') {
			if (text.length > 0 || toolCalls.length > 0) {
				result.push({
					role: 'assistant',
					content: text,
					...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
					...(preserveThinking && thinking.length > 0 ? { reasoning_content: thinking } : {}),
				});
			}
			totalChars += text.length + thinking.length;
			for (const call of toolCalls) {
				totalChars += call.function.name.length + call.function.arguments.length;
			}
			continue;
		}

		// Tool results must directly follow the assistant message that requested them.
		for (const toolResult of toolResults) {
			const content = convertToolResult(toolResult, model);
			result.push({ role: 'tool', content, tool_call_id: toolResult.callId });
			totalChars += contentCharLength(content);
		}

		if (role === 'system') {
			if (text.length > 0) {
				result.push({ role: 'system', content: text });
				totalChars += text.length;
			}
			continue;
		}

		const hasInlineImages = userParts.some((part) => part.type === 'image_url');
		if (hasInlineImages) {
			result.push({ role: 'user', content: userParts });
			totalChars += contentCharLength(userParts);
		} else if (text.length > 0) {
			result.push({ role: 'user', content: text });
			totalChars += text.length;
		}
	}

	return { messages: result, totalChars, hasImages };
}

/** Converts VS Code tool definitions into the Qwen format. */
export function convertTools(
	tools: readonly vscode.LanguageModelChatTool[] | undefined,
	model: ModelDefinition,
): QwenToolDefinition[] | undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}
	const capability = model.capabilities.toolCalling;
	if (capability === false) {
		return undefined;
	}
	const limit = typeof capability === 'number' ? capability : MAX_TOOLS_PER_REQUEST;
	const selected = tools.slice(0, Math.max(0, limit));
	if (selected.length === 0) {
		return undefined;
	}
	return selected.map((tool) => ({
		type: 'function',
		function: {
			name: tool.name,
			description: tool.description ?? '',
			parameters: (tool.inputSchema as object | undefined) ?? { type: 'object', properties: {} },
		},
	}));
}

function countMessageChars(message: vscode.LanguageModelChatRequestMessage): number {
	let total = 0;
	for (const part of message.content) {
		if (part instanceof vscode.LanguageModelTextPart) {
			total += part.value.length;
		} else if (isThinkingPart(part)) {
			total += thinkingText(part).length;
		} else if (part instanceof vscode.LanguageModelToolCallPart) {
			total += part.name.length + safeStringify(part.input).length;
		} else if (part instanceof vscode.LanguageModelToolResultPart) {
			total += contentCharLength(convertToolResult(part, EMPTY_MODEL));
		}
	}
	return total;
}

/** Token estimate used for `provideTokenCount` and context calibration. */
export function estimateTokenCount(
	value: string | vscode.LanguageModelChatRequestMessage,
	charsPerToken: number,
): number {
	const chars = typeof value === 'string' ? value.length : countMessageChars(value);
	if (chars === 0) {
		return 0;
	}
	return Math.max(1, Math.ceil(chars / Math.max(1, charsPerToken)));
}

/** Minimal model used only for character counting (no vision behaviour needed). */
const EMPTY_MODEL: ModelDefinition = {
	id: '',
	apiModel: '',
	name: '',
	family: '',
	version: '',
	detail: '',
	maxInputTokens: 0,
	maxOutputTokens: 0,
	capabilities: { toolCalling: false, imageInput: false },
};
