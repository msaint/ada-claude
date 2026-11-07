import Anthropic from "@anthropic-ai/sdk";
import type { JsonTransport } from "./openai-model";

export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Anthropic transport for LLMLearningModel. The adapter owns the prompt,
 * the embedded JSON Schema, Zod validation, the single repair call and the
 * transient-error retries, so this class only sends one Messages request
 * and returns the text.
 *
 * - SDK retries are off (maxRetries: 0); the adapter retries with jitter.
 * - Server-side refusal fallback is on (`fallbacks: "default"`): if the
 *   requested model declines, the API re-runs the request on a suitable
 *   fallback model inside the same call.
 * - Current models think adaptively and thinking counts toward max_tokens,
 *   so the cap is generous; the adapter's per-operation budget is a floor.
 */
export class AnthropicTransport implements JsonTransport {
  private client: Anthropic;
  constructor(
    apiKey: string,
    private opts: { effort?: AnthropicEffort; baseURL?: string } = {},
  ) {
    this.client = new Anthropic({ apiKey, baseURL: opts.baseURL, maxRetries: 0 });
  }

  async complete(req: { model: string; system: string; user: string; maxTokens: number; timeoutMs: number }) {
    const res = await this.client.beta.messages.create(
      {
        model: req.model,
        max_tokens: Math.max(16000, req.maxTokens),
        system: req.system,
        messages: [{ role: "user", content: req.user }],
        ...(this.opts.effort ? { output_config: { effort: this.opts.effort } } : {}),
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { timeout: req.timeoutMs },
    );
    if (res.stop_reason === "refusal") {
      // The whole fallback chain declined. Non-transient: retrying won't help.
      throw Object.assign(new Error(`Model declined the request (${res.stop_details?.category ?? "unspecified"})`), { status: 400, refusal: true });
    }
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  }
}
