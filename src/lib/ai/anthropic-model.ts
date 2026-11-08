import Anthropic from "@anthropic-ai/sdk";
import type { FetchedSource } from "./model-adapter";
import type { JsonTransport, TransportRequest } from "./openai-model";

export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

/** Minimal surface used here, so tests can inject a fake client. */
type MessagesClient = { beta: { messages: { create: Anthropic["beta"]["messages"]["create"] } } };

/** Server-side web fetch: Anthropic fetches the page; only URLs already in the conversation can be fetched. */
const WEB_FETCH_TOOL: Anthropic.Beta.BetaWebFetchTool20260209 = {
  type: "web_fetch_20260209",
  name: "web_fetch",
  max_uses: 3,
  max_content_tokens: 12000,
};
const MAX_CONTINUATIONS = 3;

/**
 * Anthropic transport for LLMLearningModel. The adapter owns the prompt,
 * the embedded JSON Schema, Zod validation, the single repair call and the
 * transient-error retries, so this class only sends Messages requests and
 * returns the final text (plus any pages the server actually fetched).
 *
 * - SDK retries are off (maxRetries: 0); the adapter retries with jitter.
 * - Server-side refusal fallback is on (`fallbacks: "default"`).
 * - With `webFetch`, the web_fetch server tool is declared; a long server-side
 *   tool loop can stop with `pause_turn`, which is resumed by re-sending the
 *   assistant content (no extra user message).
 * - Current models think adaptively and thinking counts toward max_tokens,
 *   so the cap is generous; the adapter's per-operation budget is a floor.
 */
export class AnthropicTransport implements JsonTransport {
  readonly supportsWebFetch = true;
  private client: MessagesClient;
  constructor(
    apiKey: string,
    private opts: { effort?: AnthropicEffort; baseURL?: string; client?: MessagesClient } = {},
  ) {
    this.client = opts.client ?? new Anthropic({ apiKey, baseURL: opts.baseURL, maxRetries: 0 });
  }

  async complete(req: TransportRequest) {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: req.user }];
    const sources = new Map<string, FetchedSource>();
    let inputTokens = 0;
    let outputTokens = 0;
    for (let i = 0; ; i++) {
      const res = await this.client.beta.messages.create(
        {
          model: req.model,
          max_tokens: Math.max(16000, req.maxTokens),
          system: req.system,
          messages,
          ...(req.webFetch ? { tools: [WEB_FETCH_TOOL] } : {}),
          ...(this.opts.effort ? { output_config: { effort: this.opts.effort } } : {}),
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { timeout: req.timeoutMs },
      );
      inputTokens += res.usage.input_tokens;
      outputTokens += res.usage.output_tokens;
      for (const s of fetchedSources(res.content)) sources.set(s.url, s);

      if (res.stop_reason === "pause_turn" && i < MAX_CONTINUATIONS) {
        // Resume the server-side tool loop where it left off.
        messages.splice(1, messages.length - 1, { role: "assistant", content: res.content });
        continue;
      }
      if (res.stop_reason === "refusal") {
        // The whole fallback chain declined. Non-transient: retrying won't help.
        throw Object.assign(new Error(`Model declined the request (${res.stop_details?.category ?? "unspecified"})`), { status: 400, refusal: true });
      }
      return { text: finalText(res.content), inputTokens, outputTokens, sources: [...sources.values()] };
    }
  }
}

/** Text written after the last server-tool block (earlier text is narration such as "Let me read that page"). */
export function finalText(content: Anthropic.Beta.BetaContentBlock[]): string {
  let lastTool = -1;
  content.forEach((b, i) => {
    if (b.type === "server_tool_use" || b.type === "web_fetch_tool_result") lastTool = i;
  });
  return content
    .slice(lastTool + 1)
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Pages the server actually retrieved (errors are skipped). These are the only URLs Ada ever records. */
export function fetchedSources(content: Anthropic.Beta.BetaContentBlock[]): FetchedSource[] {
  const out: FetchedSource[] = [];
  for (const b of content) {
    if (b.type !== "web_fetch_tool_result" || b.content.type !== "web_fetch_result") continue;
    out.push({ url: b.content.url, title: b.content.content.title ?? null, retrievedAt: b.content.retrieved_at ?? null });
  }
  return out;
}
