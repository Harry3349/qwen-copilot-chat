import * as vscode from 'vscode';
import { isDebugLoggingEnabled, isVerboseLoggingEnabled } from './config';
import { createHttpError, normalizeError } from './errors';
import { logger } from './logger';
import type { QwenChatRequest, QwenToolCall, QwenUsage } from './types';

export interface StreamCallbacks {
	onContent?(text: string): void;
	onThinking?(text: string): void;
	onToolCall?(toolCall: QwenToolCall): void;
	onUsage?(usage: QwenUsage): void;
}

/**
 * Builds the chat completions URL from a possibly partial base URL.
 *
 * Accepts `https://host`, `https://host/v1`, `https://host/compatible-mode/v1`
 * or a full `.../chat/completions` URL.
 */
export function resolveChatCompletionsUrl(rawBaseUrl: string): string {
	const base = rawBaseUrl.trim().replace(/\/+$/, '');
	if (base.length === 0) {
		return 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
	}
	if (/\/chat\/completions$/i.test(base)) {
		return base;
	}
	if (/\/(?:compatible-mode|openai)\/v\d+$/i.test(base) || /\/v\d+$/i.test(base)) {
		return `${base}/chat/completions`;
	}
	return `${base}/compatible-mode/v1/chat/completions`;
}

/** Mutable accumulator for streamed tool-call deltas. */
interface MutableToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}

interface SSEState {
	readonly pendingToolCalls: Map<number, MutableToolCall>;
	latestUsage?: QwenUsage;
}

/**
 * Lightweight SSE streaming client for the Qwen (DashScope) OpenAI-compatible
 * Chat Completions API. No external dependencies - uses the built-in `fetch`.
 */
export class QwenClient {
	constructor(
		private readonly baseUrl: string,
		private readonly apiKey: string,
		private readonly extraHeaders: Record<string, string> = {},
	) {}

	async streamChatCompletion(
		request: QwenChatRequest,
		callbacks: StreamCallbacks,
		token?: vscode.CancellationToken,
	): Promise<void> {
		const controller = new AbortController();
		const cancelListener = token?.onCancellationRequested(() => controller.abort());
		if (token?.isCancellationRequested) {
			controller.abort();
		}

		const state: SSEState = { pendingToolCalls: new Map() };

		try {
			const body = {
				...request,
				stream: true,
				stream_options: { include_usage: true },
			};
			const url = resolveChatCompletionsUrl(this.baseUrl);

			const headers = new Headers({
				'Content-Type': 'application/json',
				Accept: 'text/event-stream',
				Authorization: `Bearer ${this.apiKey}`,
			});
			for (const [name, value] of Object.entries(this.extraHeaders)) {
				headers.set(name, value);
			}

			if (isDebugLoggingEnabled()) {
				logger.debug(
					true,
					`POST ${url} model=${request.model} messages=${request.messages.length} tools=${request.tools?.length ?? 0} thinking=${request.enable_thinking ?? 'default'}`,
				);
			}
			if (isVerboseLoggingEnabled()) {
				logger.debug(true, `Request body: ${JSON.stringify(body)}`);
			}

			const response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: controller.signal,
			});

			if (!response.ok) {
				throw await createHttpError(response, this.baseUrl);
			}
			if (!response.body) {
				throw new Error('The Qwen API returned an empty response body.');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				if (token?.isCancellationRequested) {
					controller.abort();
					return;
				}

				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					const trimmed = line.trim();
					if (trimmed.length === 0 || trimmed.startsWith(':')) {
						continue;
					}
					if (!trimmed.startsWith('data:')) {
						continue;
					}
					const payload = trimmed.slice(5).trim();
					if (payload === '[DONE]') {
						flushToolCalls(state, callbacks);
						reportUsage(state, callbacks);
						return;
					}
					this.handleChunk(payload, state, callbacks);
				}
			}

			// Stream ended without an explicit [DONE] marker.
			flushToolCalls(state, callbacks);
			reportUsage(state, callbacks);
		} catch (error) {
			if (isAbortError(error) && token?.isCancellationRequested) {
				return;
			}
			const normalized = normalizeError(error, this.baseUrl);
			logger.error('Qwen request failed:', normalized.message);
			throw normalized;
		} finally {
			cancelListener?.dispose();
		}
	}

	private handleChunk(payload: string, state: SSEState, callbacks: StreamCallbacks): void {
		let chunk: {
			choices?: Array<{
				delta?: {
					content?: string | null;
					reasoning_content?: string | null;
					tool_calls?: Array<{
						index?: number;
						id?: string;
						function?: { name?: string; arguments?: string };
					}>;
				};
				finish_reason?: string | null;
			}>;
			usage?: QwenUsage;
		};
		try {
			chunk = JSON.parse(payload) as typeof chunk;
		} catch {
			logger.debug(true, `Failed to parse SSE chunk: ${payload.slice(0, 200)}`);
			return;
		}

		if (chunk.usage) {
			state.latestUsage = chunk.usage;
		}

		const choice = chunk.choices?.[0];
		if (!choice) {
			return;
		}

		if (choice.delta?.reasoning_content) {
			callbacks.onThinking?.(choice.delta.reasoning_content);
		}
		if (choice.delta?.content) {
			callbacks.onContent?.(choice.delta.content);
		}

		if (choice.delta?.tool_calls) {
			for (const delta of choice.delta.tool_calls) {
				const index = delta.index ?? 0;
				let pending: MutableToolCall | undefined = state.pendingToolCalls.get(index);
				if (!pending) {
					pending = {
						id: delta.id ?? `qwen_call_${index}`,
						type: 'function',
						function: { name: '', arguments: '' },
					};
					state.pendingToolCalls.set(index, pending);
				}
				if (delta.function?.name) {
					pending.function.name += delta.function.name;
				}
				if (delta.function?.arguments) {
					pending.function.arguments += delta.function.arguments;
				}
			}
		}

		if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
			flushToolCalls(state, callbacks);
		}
	}
}

function flushToolCalls(state: SSEState, callbacks: StreamCallbacks): void {
	if (state.pendingToolCalls.size === 0) {
		return;
	}
	for (const toolCall of state.pendingToolCalls.values()) {
		if (toolCall.function.name.length > 0) {
			callbacks.onToolCall?.(toolCall);
		}
	}
	state.pendingToolCalls.clear();
}

function reportUsage(state: SSEState, callbacks: StreamCallbacks): void {
	if (state.latestUsage) {
		callbacks.onUsage?.(state.latestUsage);
	}
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError';
}

/** Re-thrown so unhandled rejections keep the original type. */
export { isAbortError };
