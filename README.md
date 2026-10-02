# Qwen for Copilot Chat

Use **Qwen** models from Alibaba Cloud Model Studio (DashScope) directly in GitHub Copilot Chat —
with streaming, thinking mode, tool calling and image input.

The extension registers a `languageModelChatProvider` for the `qwen` vendor, so Qwen models show up
next to the built-in Copilot models in the model picker.

## Features

- **All Qwen models in the Copilot model picker** — Qwen3.8 Max / Flash, Qwen3.7 Plus / Flash,
  Qwen3 Coder Plus, Qwen3.8 Omni Flash, Qwen3 VL Plus, Qwen Plus, Qwen Max, Qwen Turbo, Qwen Long.
- **Streaming responses** over the OpenAI-compatible Chat Completions endpoint.
- **Thinking mode** (hybrid reasoning) selectable per chat via the `Thinking` dropdown
  (`none` / `low` / `medium` / `high`), mapped to `enable_thinking` + `thinking_budget`.
- **Tool calling / agents** — Copilot's tools are forwarded as OpenAI function definitions.
- **Image input** for vision-capable models (Qwen3.8 Max, Qwen3.7 Plus, Omni Flash, VL Plus).
- **Token usage** reported back to Copilot, including cached input tokens.
- **Secure API key storage** in VS Code's SecretStorage.

## Requirements

- VS Code 1.116 or newer
- GitHub Copilot Chat extension
- An Alibaba Cloud Model Studio (DashScope) API key

## Setup

1. Create an API key in the Model Studio console — run the command **Qwen: Get API Key** to open the docs.
2. Run **Qwen: Set API Key** from the Command Palette and paste the key (starts with `sk-`).
3. Open Copilot Chat, click the model picker and select a Qwen model.

Set `qwen-copilot.baseUrl` to the endpoint shown in **your** console — qwencloud and Model Studio
(DashScope) are different platforms and a key only works on the platform that issued it:

| Console | Key format | Base URL |
| --- | --- | --- |
| QwenCloud — Token Plan | `sk-sp-…` | `https://token-plan.maas.qwencloudapi.com/compatible-mode/v1` |
| QwenCloud — Pay-As-You-Go | `sk-…` | `https://maas.qwencloudapi.com/compatible-mode/v1` |
| Model Studio / DashScope — China (Beijing) | `sk-…` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Model Studio / DashScope — Singapore | `sk-…` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |

The key type and the base URL must match: Token Plan (`sk-sp-…`) and Pay-As-You-Go (`sk-…`) keys are
**not interchangeable**, and QwenCloud keys do not work against DashScope.

> Consoles display the key **masked** after creation (e.g. `sk-sp-H.LDHID.5****WreZ…`) — the full value
> is only shown once. Copying the masked text can never authenticate. Create a new key to get a full value;
> the extension rejects masked keys with a clear message when you try to save them.

## Commands

| Command | Description |
| --- | --- |
| `Qwen: Set API Key` | Store the API key in SecretStorage |
| `Qwen: Clear API Key` | Remove the stored API key |
| `Qwen: Get API Key` | Open the API key documentation |
| `Qwen: Refresh Models` | Re-query the model list in Copilot Chat |
| `Qwen: Test Connection` | Verify endpoint and API key; detects a region mismatch and offers to fix the base URL |
| `Qwen: Open Settings` | Open the extension settings |
| `Qwen: Show Logs` | Open the output channel |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `qwen-copilot.baseUrl` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | API base URL. `/chat/completions` is appended automatically. |
| `qwen-copilot.apiKey` | `""` | Plain-text fallback for automation / CI. Prefer **Qwen: Set API Key**. |
| `qwen-copilot.maxTokens` | `0` | Max output tokens per request. `0` = API default. |
| `qwen-copilot.temperature` | `-1` | Sampling temperature. `-1` = API default. |
| `qwen-copilot.preserveThinking` | `false` | Replay previous `reasoning_content` on follow-up turns (`preserve_thinking`). |
| `qwen-copilot.enabledModels` | `[]` | Allow-list of model IDs. Empty = all built-in models. |
| `qwen-copilot.modelInfoOverrides` | `{}` | Per-model overrides (API model ID, display name, token limits, capabilities). |
| `qwen-copilot.extraModels` | `[]` | Add your own Qwen models to the picker. |
| `qwen-copilot.requestHeaders` | `{}` | Extra headers for every request (proxies, gateways). |
| `qwen-copilot.debugMode` | `minimal` | `minimal`, `metadata` or `verbose` logging. |

### Examples

Point a model at a dated snapshot and adjust its context window:

```json
{
  "qwen-copilot.modelInfoOverrides": {
    "qwen3.8-max": {
      "apiModel": "qwen3.8-max-0902",
      "maxInputTokens": 1000000,
      "maxOutputTokens": 32768
    }
  }
}
```

Add a model that is not built in:

```json
{
  "qwen-copilot.extraModels": [
    {
      "id": "my-qwen",
      "apiModel": "qwen3.5-flash",
      "name": "My Qwen",
      "maxInputTokens": 262144,
      "maxOutputTokens": 32768,
      "imageInput": true,
      "toolCalling": true,
      "thinking": true
    }
  ]
}
```

## Troubleshooting

- **Models show a warning icon** — no API key is configured. Run **Qwen: Set API Key**.
- **HTTP 401/403 (`invalid_api_key`)** — three causes, in order of likelihood:
  1. **Wrong platform.** The key was issued by a different service than `qwen-copilot.baseUrl` points at
     (qwencloud vs Model Studio/DashScope). Compare the base URL in your console with the table above.
  2. **Masked key.** The stored value is the partially hidden display form (it contains `*` or `…`).
     Copy the full key from the console.
  3. **Key belongs to another region.** DashScope keys are region-specific.

  Run **Qwen: Test Connection** — it probes the configured endpoint plus its siblings from the same
  credential family and offers to switch `qwen-copilot.baseUrl` in one click. It never sends your key to
  an unrelated host. If every endpoint rejects the key, it says so explicitly and offers to re-enter it;
  the output channel then logs the key *shape* (length, `sk-` prefix, masking/paste artifacts) so you can
  spot a truncated or malformed key without exposing the secret.
- **`fetch failed` / `ENOTFOUND`** — the hostname in `qwen-copilot.baseUrl` does not exist. Note that
  QwenCloud lives on **`qwencloudapi.com`**, not `qwencloud.com`.
- **HTTP 429** — rate limit or quota exceeded.
- **No thinking output** — pick a model that supports thinking and set `Thinking` to a non-`none` value.
- Detailed diagnostics: set `qwen-copilot.debugMode` to `metadata` (or `verbose`) and run
  **Qwen: Show Logs**.

## Development

```sh
npm install
npm run compile     # or: npm run watch
```

Press <kbd>F5</kbd> to launch an Extension Development Host, or build a VSIX:

```sh
npm run packagenpx vsce install dist/qwen-copilot-chat-0.5.1.vsix
```

## Disclaimer

This is an unofficial, community-built extension. It is not affiliated with, endorsed by, or
sponsored by Alibaba Cloud, Alibaba Group or GitHub. Qwen and Alibaba Cloud Model Studio are
trademarks of their respective owners.
