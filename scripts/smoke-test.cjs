// Smoke test for the compiled extension.
//
// It loads `out/extension.js` with a stubbed `vscode` module, activates the
// extension, and exercises the full request/SSE path against a fake `fetch`.
// No API key or network access required.
//
// Usage: npm run test:smoke   (requires `npm run compile` first)
const Module = require('node:module');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

class Disposable {
	dispose() {}
}

class EventEmitter {
	constructor() {
		this.listeners = [];
		this.event = (fn) => {
			this.listeners.push(fn);
			return new Disposable();
		};
	}
	fire(value) {
		for (const listener of this.listeners) listener(value);
	}
	dispose() {
		this.listeners = [];
	}
}

class Uri {
	constructor(value) {
		this.value = value;
	}
	static parse(value) {
		return new Uri(value);
	}
	toString() {
		return this.value;
	}
}

class ThemeIcon {
	constructor(id) {
		this.id = id;
	}
}
class LanguageModelTextPart {
	constructor(value) {
		this.value = value;
	}
}
class LanguageModelToolCallPart {
	constructor(callId, name, input) {
		this.callId = callId;
		this.name = name;
		this.input = input;
	}
}
class LanguageModelToolResultPart {
	constructor(callId, content) {
		this.callId = callId;
		this.content = content;
	}
}
class LanguageModelDataPart {
	constructor(data, mimeType) {
		this.data = data;
		this.mimeType = mimeType;
	}
}
class LanguageModelPromptTsxPart {
	constructor(value) {
		this.value = value;
	}
}
class LanguageModelThinkingPart {
	constructor(value) {
		this.value = value;
	}
}

const configValues = {};
const captured = {};

const vscodeStub = {
	EventEmitter,
	Uri,
	ThemeIcon,
	LanguageModelTextPart,
	LanguageModelToolCallPart,
	LanguageModelToolResultPart,
	LanguageModelDataPart,
	LanguageModelPromptTsxPart,
	LanguageModelThinkingPart,
	LanguageModelChatMessageRole: { User: 1, Assistant: 2 },
	LanguageModelChatToolMode: { Auto: 1, Required: 2 },
	workspace: {
		onDidChangeConfiguration: () => new Disposable(),
		getConfiguration: () => ({
			get: (key, fallback) => (key in configValues ? configValues[key] : fallback),
		}),
	},
	window: {
		createOutputChannel: () => ({ info() {}, warn() {}, error() {}, debug() {}, show() {}, dispose() {} }),
		showInformationMessage: () => Promise.resolve(undefined),
		showWarningMessage: () => Promise.resolve(undefined),
		showInputBox: () => Promise.resolve(undefined),
	},
	commands: {
		registerCommand: () => new Disposable(),
		executeCommand: () => Promise.resolve(undefined),
	},
	extensions: { getExtension: () => undefined },
	env: { openExternal: () => Promise.resolve(true), uriScheme: 'vscode' },
	lm: {
		registerLanguageModelChatProvider: (vendor, provider) => {
			captured.vendor = vendor;
			captured.provider = provider;
			return new Disposable();
		},
	},
};

// The compiled extension calls `require('vscode')`; serve it the stub instead.
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
	if (request === 'vscode') {
		return vscodeStub;
	}
	return originalLoad.call(this, request, ...rest);
};

const context = {
	subscriptions: { push() {} },
	secrets: {
		get: async () => 'sk-test-key',
		store: async () => {},
		delete: async () => {},
		onDidChange: () => new Disposable(),
	},
	extension: { packageJSON: { version: '0.1.0' } },
	globalStorageUri: { toString: () => 'file:///tmp' },
};

// One SSE event is deliberately split across two chunks (mid-line) to verify
// that partial lines are buffered correctly.
const SPLIT_EVENTS = [
	'data: {"choices":[{"delta":{"reasoning_content":"Let me think"}}]}\n\n',
	'data: {"choices":[{"delta":{"content":"Hel',
	'lo "}}]}\n\n',
	'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather","arguments":"{\\"city\\":"}}]}}]}\n\n',
	'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Paris\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
	'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15,"prompt_tokens_details":{"cached_tokens":4}}}\n\ndata: [DONE]\n\n',
];

(async () => {
	const extension = require(path.join(ROOT, 'out/extension.js'));
	extension.activate(context);

	assert.equal(captured.vendor, 'qwen', 'provider must register for vendor "qwen"');
	assert.ok(captured.provider, 'provider must be registered');

	const info = await captured.provider.provideLanguageModelChatInformation(
		{ silent: false },
		{ isCancellationRequested: false, onCancellationRequested: () => new Disposable() },
	);
	assert.equal(info.length, 11, `expected 11 built-in models, got ${info.length}`);
	assert.equal(info[0].id, 'qwen3.8-max');
	assert.equal(info[0].capabilities.imageInput, true);
	assert.ok(info[0].configurationSchema, 'thinking model must expose configurationSchema');
	assert.ok(
		info.every((model) => model.isBYOK === true),
		'models must be marked as BYOK',
	);

	const tokenCount = await captured.provider.provideTokenCount(null, 'a'.repeat(40), null);
	assert.ok(tokenCount > 0 && tokenCount <= 40, `unexpected token count ${tokenCount}`);

	let requestedUrl;
	let requestedBody;
	global.fetch = async (url, init) => {
		requestedUrl = url;
		requestedBody = JSON.parse(init.body);
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				for (const event of SPLIT_EVENTS) {
					controller.enqueue(encoder.encode(event));
				}
				controller.close();
			},
		});
		return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
	};

	const parts = [];
	await captured.provider.provideLanguageModelChatResponse(
		{
			id: 'qwen3.8-max',
			name: 'Qwen3.8 Max',
			family: 'qwen',
			version: '3.8',
			maxInputTokens: 1,
			maxOutputTokens: 1,
			capabilities: {},
		},
		[{ role: 1, content: [new LanguageModelTextPart('hello')], name: undefined }],
		{ tools: undefined, toolMode: 1, modelOptions: { reasoningEffort: 'low' } },
		{ report: (part) => parts.push(part) },
		{ isCancellationRequested: false, onCancellationRequested: () => new Disposable() },
	);

	assert.equal(requestedUrl, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
	assert.equal(requestedBody.model, 'qwen3.8-max');
	assert.equal(requestedBody.stream, true);
	assert.equal(requestedBody.enable_thinking, true, 'thinking should be enabled');
	assert.equal(requestedBody.thinking_budget, 1024, 'low effort maps to 1024 tokens');
	assert.equal(requestedBody.messages[0].role, 'user');

	const text = parts
		.filter((part) => part instanceof LanguageModelTextPart)
		.map((part) => part.value)
		.join('');
	assert.equal(text, 'Hello ', `streamed text, got ${JSON.stringify(text)}`);

	const thinking = parts
		.filter((part) => part instanceof LanguageModelThinkingPart)
		.map((part) => part.value)
		.join('');
	assert.equal(thinking, 'Let me think', 'reasoning_content must be reported as a thinking part');

	const toolCall = parts.find((part) => part instanceof LanguageModelToolCallPart);
	assert.ok(toolCall, 'tool call part must be reported');
	assert.equal(toolCall.name, 'get_weather');
	assert.deepEqual(toolCall.input, { city: 'Paris' }, 'streamed tool arguments must be reassembled');

	const usagePart = parts.find((part) => part instanceof LanguageModelDataPart && part.mimeType === 'usage');
	assert.ok(usagePart, 'usage data part must be reported');
	assert.equal(JSON.parse(new TextDecoder().decode(usagePart.data)).prompt_tokens, 10);

	// --- connection diagnostics: detect a region / API key mismatch ---
	const { endpointCandidates } = require(path.join(ROOT, 'out/endpoints.js'));
	const { diagnoseConnection } = require(path.join(ROOT, 'out/diagnostics.js'));

	const candidates = endpointCandidates('https://dashscope.aliyuncs.com/compatible-mode/v1');
	assert.equal(candidates.length, 2, 'the DashScope sibling endpoint must be probed as a fallback');
	assert.equal(candidates[1].baseUrl, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1');
	assert.equal(endpointCandidates('https://my-proxy.example.com/v1').length, 1, 'custom hosts have no fallback');

	const qwencloudCandidates = endpointCandidates(
		'https://token-plan.maas.qwencloudapi.com/compatible-mode/v1',
	);
	assert.equal(qwencloudCandidates.length, 2, 'the QwenCloud Pay-As-You-Go sibling must be probed');
	assert.equal(qwencloudCandidates[1].baseUrl, 'https://maas.qwencloudapi.com/compatible-mode/v1');
	assert.equal(
		endpointCandidates('https://maas.qwencloudapi.com/compatible-mode/v1')[1].baseUrl,
		'https://token-plan.maas.qwencloudapi.com/compatible-mode/v1',
	);
	assert.ok(
		endpointCandidates('https://dashscope.aliyuncs.com/compatible-mode/v1').every(
			(candidate) => !candidate.baseUrl.includes('qwencloud'),
		),
		'a DashScope key must never be probed against QwenCloud',
	);
	assert.ok(
		endpointCandidates('https://token-plan.maas.qwencloudapi.com/compatible-mode/v1').every(
			(candidate) => !candidate.baseUrl.includes('dashscope'),
		),
		'a QwenCloud key must never be probed against DashScope',
	);

	// Key rejected by the China endpoint but accepted by the international one.
	global.fetch = async (url) => {
		if (String(url).includes('dashscope-intl')) {
			return new Response('{}', { status: 200 });
		}
		return new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: 'Incorrect API key provided.' } }), {
			status: 401,
		});
	};
	const mismatch = await diagnoseConnection({
		configuredBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
		apiKey: 'sk-invalid',
		model: 'qwen3.8-flash',
	});
	assert.equal(mismatch.results.length, 2);
	assert.equal(mismatch.results[0].kind, 'auth');
	assert.equal(mismatch.results[0].status, 401);
	assert.equal(mismatch.results[1].kind, 'ok');
	assert.equal(mismatch.recommendation, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1');

	// Working endpoint: no second probe, no recommendation.
	global.fetch = async () => new Response('{}', { status: 200 });
	const healthy = await diagnoseConnection({
		configuredBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
		apiKey: 'sk-ok',
		model: 'qwen3.8-flash',
	});
	assert.equal(healthy.results.length, 1);
	assert.ok(healthy.working);
	assert.equal(healthy.recommendation, undefined);

	// Quota errors are not a region problem: do not probe the other region.
	global.fetch = async () => new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 });
	const quota = await diagnoseConnection({
		configuredBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
		apiKey: 'sk-ok',
		model: 'qwen3.8-flash',
	});
	assert.equal(quota.results.length, 1, 'non-auth failures must not trigger a region fallback');
	assert.equal(quota.results[0].kind, 'quota');

	// Both regions rejecting the key: no recommendation, both probes classified as auth.
	global.fetch = async () =>
		new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: 'Incorrect API key provided.' } }), {
			status: 401,
		});
	const bothWrong = await diagnoseConnection({
		configuredBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
		apiKey: 'sk-wrong',
		model: 'qwen3.8-flash',
	});
	assert.equal(bothWrong.results.length, 2, 'both regions must be probed on auth failures');
	assert.ok(
		bothWrong.results.every((result) => result.kind === 'auth'),
		'both probes must report auth failures',
	);
	assert.equal(bothWrong.recommendation, undefined, 'no recommendation when no region works');

	// --- API key hygiene: strip paste artifacts, describe the shape ---
	const { normalizeApiKey, describeApiKey } = require(path.join(ROOT, 'out/apikey.js'));
	const fakeKey = `sk-${'a'.repeat(32)}`;

	assert.equal(normalizeApiKey(`  ${fakeKey}  `), fakeKey, 'whitespace must be trimmed');
	assert.equal(normalizeApiKey(`Bearer ${fakeKey}`), fakeKey, '"Bearer " prefix must be stripped');
	assert.equal(normalizeApiKey(`bearer   ${fakeKey}`), fakeKey, 'prefix match is case-insensitive');
	assert.equal(normalizeApiKey(`"${fakeKey}"`), fakeKey, 'double quotes must be stripped');
	assert.equal(normalizeApiKey(`'${fakeKey}'`), fakeKey, 'single quotes must be stripped');
	assert.equal(normalizeApiKey(`\`${fakeKey}\``), fakeKey, 'backticks must be stripped');
	assert.equal(
		normalizeApiKey(`"Bearer ${fakeKey}"`),
		fakeKey,
		'quotes and prefix must be stripped in any order',
	);

	const quotedShape = describeApiKey(`"Bearer ${fakeKey}"`);
	assert.equal(quotedShape.looksLikeDashScopeKey, true);
	assert.equal(quotedShape.hadQuotes, true);
	assert.equal(quotedShape.hadBearerPrefix, true);
	assert.equal(quotedShape.length, fakeKey.length);
	assert.equal(describeApiKey('short').looksLikeDashScopeKey, false, 'truncated keys must be flagged');

	// Masked console values (the "…5****W…" display form) must be detected and never mangled.
	const maskedKey = 'sk-sp-abc.def.5****Wxyz';
	assert.equal(describeApiKey(maskedKey).masked, true, 'masked keys must be detected');
	assert.equal(describeApiKey(fakeKey).masked, false, 'real keys must not be flagged as masked');
	assert.equal(describeApiKey('sk-abc…defghijklmnopqrst').masked, true, 'ellipsis must be detected');
	assert.equal(normalizeApiKey(maskedKey), maskedKey, 'masking characters must not be stripped silently');

	// A hostname that does not resolve must be reported as a DNS problem, not as a
	// generic network error, and must not trigger probes of other hosts.
	const { probeEndpoint } = require(path.join(ROOT, 'out/diagnostics.js'));
	global.fetch = async () => {
		const error = new TypeError('fetch failed');
		error.cause = Object.assign(new Error('getaddrinfo ENOTFOUND wrong.invalid'), { code: 'ENOTFOUND' });
		throw error;
	};
	const dnsProbe = await probeEndpoint(
		{ label: 'configured', baseUrl: 'https://wrong.invalid/compatible-mode/v1' },
		'sk-test',
		'qwen3.8-flash',
	);
	assert.equal(dnsProbe.kind, 'dns', 'ENOTFOUND must be classified as a DNS failure');
	assert.ok(
		dnsProbe.message.includes('ENOTFOUND') || dnsProbe.message.includes('getaddrinfo'),
		`the DNS reason must be surfaced, got: ${dnsProbe.message}`,
	);
	const dnsDiagnosis = await diagnoseConnection({
		configuredBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
		apiKey: 'sk-test',
		model: 'qwen3.8-flash',
	});
	assert.equal(dnsDiagnosis.results.length, 1, 'a DNS failure must not trigger further probes');

	extension.deactivate();
	console.log(
		'SMOKE TEST PASSED: activation, model list, streaming, thinking, tool calls, usage, connection diagnostics, key hygiene',
	);
})().catch((error) => {
	console.error('SMOKE TEST FAILED:', error);
	process.exitCode = 1;
});
