/**
 * Compile-time constants that do not depend on the VS Code runtime.
 */

/** VS Code configuration section prefix for all extension settings. */
export const CONFIG_SECTION = 'qwen-copilot';

/** Output channel name. */
export const OUTPUT_CHANNEL_NAME = 'Qwen';

/** Vendor id used to register the language model chat provider (must match package.json). */
export const VENDOR = 'qwen';

/** SecretStorage key for the Qwen (DashScope) API key. */
export const API_KEY_SECRET = 'qwen-copilot.apiKey';

/** Default DashScope OpenAI-compatible endpoint (China / Beijing region). */
export const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

/** DashScope OpenAI-compatible endpoint for the Singapore (international) region. */
export const INTERNATIONAL_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

/**
 * VS Code's internal System message role. `LanguageModelChatMessageRole` only
 * exposes `User` and `Assistant`, but chat requests may carry a system prompt.
 */
export const LANGUAGE_MODEL_CHAT_SYSTEM_ROLE = 3;

/** Data-part mime type Copilot uses to read token usage from a provider. */
export const COPILOT_USAGE_DATA_PART_MIME = 'usage';

/** Lowercase prefix of mime types treated as inline images. */
export const IMAGE_MIME_PREFIX = 'image/';

/** Average characters per token used when the API did not return usage data. */
export const DEFAULT_CHARS_PER_TOKEN = 4;

/** DeepSeek-compatible default tool cap; DashScope allows far more. */
export const MAX_TOOLS_PER_REQUEST = 128;

export const EXTERNAL_URLS = {
	/** Documentation explaining how to create an API key. */
	apiKeys: 'https://www.alibabacloud.com/help/en/model-studio/get-api-key',
	/** Model Studio console. */
	console: 'https://modelstudio.console.alibabacloud.com/',
	/** Model catalogue. */
	models: 'https://www.alibabacloud.com/help/en/model-studio/models',
} as const;
