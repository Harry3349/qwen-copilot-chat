# Changelog

All notable changes to the "Qwen for Copilot Chat" extension are documented here.

## 0.6.0

- Add an extension **icon** and a matching `galleryBanner` colour, so the extension is recognisable in
  the marketplace and in the Extensions view.
- Rewrite the README with a logo, badges, a table of contents and an installation section; add
  `homepage` and `bugs` links to the manifest.

## 0.5.3

- Change the `publisher` to **Harry3349** so the extension can be published to Open VSX with an
  automatically verified namespace (matched against the public GitHub repository).

## 0.5.2

- Remove the **Qwen: Benchmark vs DeepSeek** command and its `src/benchmark.ts` module. Benchmarking
  was a development-only tool and is no longer part of the extension. All other commands are unchanged.

## 0.5.1

- Fix the benchmark stalling during code generation: each streamed request now has a hard
  **45 s deadline** and a **12 000-character output cap**. If a model is slow, over-generates or the
  stream goes quiet, the run is cancelled, marked `⚠ timeout` / `(capped)` in the log, and the benchmark
  continues instead of blocking forever.

## 0.5.0

- Add **Qwen: Benchmark vs DeepSeek (uses stored API keys)**. Streams identical prompts through Qwen3.8
  Flash and DeepSeek V4.1 Flash via `vscode.lm`, so each provider authenticates with its **own** key from
  SecretStorage — no API key is ever entered, read or logged by the benchmark. Reports medians over 3
  interleaved runs per scenario (TTFT, total time, tokens/s) with thinking disabled for a fair comparison.
  Results are written to the **Qwen** output channel.

## 0.4.2

- **Qwen: Test Connection** now checks the model you last chatted with (e.g. Qwen3.8 Flash) instead of
  always the first model in the list, so the result matches your selected model.
- Connection messages refer to "probed endpoints" instead of "both regions", matching the two credential
  families (QwenCloud and DashScope).

## 0.4.1

- Correct the QwenCloud endpoint domain to **`qwencloudapi.com`** (Token Plan
  `https://token-plan.maas.qwencloudapi.com/compatible-mode/v1`, Pay-As-You-Go
  `https://maas.qwencloudapi.com/compatible-mode/v1`).
- Classify unresolvable hostnames as a dedicated `dns` failure and surface the underlying reason
  (`getaddrinfo ENOTFOUND …`) instead of a bare `fetch failed`.
- Document that Token Plan (`sk-sp-…`) and Pay-As-You-Go (`sk-…`) keys are bound to different base URLs
  and are not interchangeable, and that the full key is only shown once at creation.

## 0.4.0

- Reject **masked API keys** (`sk-sp-…5****W…`) when saving them. Consoles display the key only
  partially; such a value can never authenticate and was a confirmed cause of `invalid_api_key`.
- Add the **qwencloud MaaS** endpoints (`https://token-plan.maas.qwencloud.com/compatible-mode/v1` and
  `https://maas.qwencloud.com/compatible-mode/v1`) as a known credential family, so **Qwen: Test
  Connection** can detect the right platform.
- Connection test now only probes siblings of the *same* credential family, so a key is never sent to an
  unrelated host, and it stops probing further hosts on network errors.

## 0.3.0

- Strip common paste artifacts from the API key (surrounding quotes/backticks and a leading `Bearer `
  prefix). These artifacts previously made a valid key fail with `invalid_api_key`.
- Report the key *shape* (length, `sk-` prefix, whitespace/quotes/Bearer detected) in the output channel
  when authentication fails, so a truncated or malformed key can be identified without revealing it.
- **Qwen: Test Connection** now distinguishes "wrong region" from "invalid key": when every probed
  region rejects the key, it says so explicitly and offers to re-enter the key.

## 0.2.0

- Add the **Qwen: Test Connection** command. It sends a minimal request to verify the endpoint and API
  key and, when the key is rejected, probes the DashScope endpoint of the other region (API keys are
  region-specific). If the other region works, it offers to update `qwen-copilot.baseUrl` in one click.
- Document the region mismatch as the primary cause of `401 invalid_api_key`.

## 0.1.0

Initial release.

- Register a `languageModelChatProvider` for the `qwen` vendor so Qwen models appear in GitHub
  Copilot Chat.
- Built-in model registry: Qwen3.8 Max, Qwen3.8 Flash, Qwen3.7 Plus, Qwen3.7 Flash,
  Qwen3 Coder Plus, Qwen3.8 Omni Flash, Qwen3 VL Plus, Qwen Plus, Qwen Max, Qwen Turbo, Qwen Long.
- Streaming responses via the DashScope OpenAI-compatible Chat Completions API.
- Thinking mode (`enable_thinking` + `thinking_budget`) selectable per chat.
- Tool calling and agent support.
- Image input for vision-capable models.
- Token usage reporting (including cached input tokens) back to Copilot.
- Secure API key storage in VS Code SecretStorage, with a settings fallback.
- Settings for base URL, token limits, temperature, model overrides, extra models, request headers
  and debug logging.
