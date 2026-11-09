import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ModelError } from "@/lib/errors";
import { log } from "@/lib/log";
import {
  ActivityGenSchema,
  ClarificationResultSchema,
  CurriculumExpansionSchema,
  CurriculumProposalSchema,
  EvaluationResultSchema,
  ExplanationResultSchema,
  HintResultSchema,
} from "@/lib/schemas/model";
import { validateCurriculum } from "@/lib/learning/curriculum";
import { containsUrl, type FetchedSource, type LearningModel, type ModelInfo, type WithInfo } from "./model-adapter";
import * as P from "./prompts";

/** Minimal transport so the adapter can be tested without network access. */
export type TransportRequest = {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
  /** Let the provider fetch URLs present in the request (only providers with a server-side fetch tool honor it). */
  webFetch?: boolean;
  /** Reasoning effort for this operation (providers that support it). */
  effort?: string;
};

export interface JsonTransport {
  readonly supportsWebFetch?: boolean;
  complete(req: TransportRequest): Promise<{
    text: string;
    inputTokens?: number;
    outputTokens?: number;
    sources?: FetchedSource[];
  }>;
}

export type ModelIds = { clarify: string; compile: string; tutor: string; evaluate: string };

export class OpenAITransport implements JsonTransport {
  private client: OpenAI;
  constructor(apiKey: string, baseURL?: string) {
    // SDK retries are disabled; the adapter owns bounded retry with jitter.
    this.client = new OpenAI({ apiKey, baseURL, maxRetries: 0 });
  }
  // No server-side fetch tool on this path; `webFetch` is ignored and the model is told to ask instead.
  async complete(req: TransportRequest) {
    const res = await this.client.chat.completions.create(
      {
        model: req.model,
        response_format: { type: "json_object" },
        max_completion_tokens: req.maxTokens,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      },
      { timeout: req.timeoutMs },
    );
    return {
      text: res.choices[0]?.message?.content ?? "",
      inputTokens: res.usage?.prompt_tokens,
      outputTokens: res.usage?.completion_tokens,
    };
  }
}

export type Op = "clarify" | "compile" | "expand" | "activity" | "evaluate" | "explain" | "hint";
/** Learner-facing quick operations vs. operations that benefit from deeper reasoning. */
export const FAST_OPS: Op[] = ["clarify", "activity", "hint", "explain"];
export const DEEP_OPS: Op[] = ["compile", "expand", "evaluate"];
const BUDGET: Record<Op, number> = { clarify: 1200, compile: 3000, expand: 2000, activity: 2200, evaluate: 1000, explain: 1200, hint: 300 };

export function isTransient(err: unknown): boolean {
  if (err instanceof OpenAI.APIConnectionTimeoutError || err instanceof OpenAI.APIConnectionError) return true;
  if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIConnectionError) return true;
  const status = (err as { status?: number })?.status;
  if (status === 429 || (typeof status === "number" && status >= 500)) return true;
  const name = (err as { name?: string })?.name ?? "";
  return /timeout|abort/i.test(name);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class LLMLearningModel implements LearningModel {
  readonly provider: string;
  constructor(
    private transport: JsonTransport,
    private models: ModelIds,
    private opts: { timeoutMs: number; maxTransientRetries?: number; retryBaseMs?: number; provider?: string; effortByOp?: Partial<Record<Op, string>> } = { timeoutMs: 45000 },
  ) {
    this.provider = opts.provider ?? "openai";
  }

  /**
   * Calls the model, parses JSON, validates with Zod and an optional
   * semantic validator, and asks the model to repair ONCE on invalid output.
   * Transient transport failures are retried with jittered backoff.
   */
  private async run<T>(
    op: Op,
    model: string,
    user: string,
    schema: z.ZodType<T>,
    semantic?: (v: T) => { ok: true; value: T } | { ok: false; errors: string[] },
    opts: { webFetch?: boolean } = {},
  ): Promise<WithInfo<T>> {
    const webFetch = !!opts.webFetch && !!this.transport.supportsWebFetch;
    const sources = new Map<string, FetchedSource>();
    const jsonSchema = JSON.stringify(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }));
    const baseUser = `${user}\n\nJSON Schema for your output:\n${jsonSchema}`;
    const started = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let prompt = baseUser;
    let lastErrors: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.callWithRetry(op, model, prompt, webFetch);
      for (const s of res.sources ?? []) sources.set(s.url, s);
      inputTokens += res.inputTokens ?? 0;
      outputTokens += res.outputTokens ?? 0;
      const parsed = parseJsonObject(res.text);
      if (parsed === undefined) {
        lastErrors = ["output was not a JSON object"];
      } else {
        const r = schema.safeParse(parsed);
        if (!r.success) {
          lastErrors = r.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
        } else {
          const s = semantic ? semantic(r.data) : { ok: true as const, value: r.data };
          if (s.ok) {
            const info: ModelInfo = {
              provider: this.provider,
              model,
              operation: op,
              latencyMs: Date.now() - started,
              inputTokens,
              outputTokens,
              repaired: attempt > 0,
              ...(sources.size ? { sources: [...sources.values()] } : {}),
            };
            return { value: s.value, info };
          }
          lastErrors = s.errors;
        }
      }
      log.warn("model_output_invalid", { op, attempt, errors: lastErrors });
      prompt = `${baseUser}\n\nYour previous output was invalid:\n- ${lastErrors.join("\n- ")}\nReturn a corrected JSON object only.`;
    }
    throw new ModelError("model_invalid_output", `The model returned invalid ${op} output (${lastErrors[0] ?? "unknown"}).`, true);
  }

  private async callWithRetry(op: Op, model: string, user: string, webFetch = false) {
    const max = this.opts.maxTransientRetries ?? 2;
    const base = this.opts.retryBaseMs ?? 400;
    for (let i = 0; ; i++) {
      try {
        return await this.transport.complete({
          model,
          system: P.SYSTEM,
          user: webFetch ? `${user}\n\n${P.WEB_FETCH_NOTE}` : user,
          maxTokens: BUDGET[op],
          timeoutMs: this.opts.timeoutMs,
          webFetch,
          effort: this.opts.effortByOp?.[op],
        });
      } catch (err) {
        const transient = isTransient(err);
        log.warn("model_call_failed", { op, attempt: i, transient, error: (err as Error)?.message });
        if (!transient || i >= max) {
          const timeout = /timeout|abort/i.test(`${(err as Error)?.name} ${(err as Error)?.message}`);
          throw new ModelError(timeout ? "model_timeout" : "model_unavailable", timeout ? "The model took too long to respond." : "The model is unavailable right now.", true);
        }
        await sleep(base * 2 ** i + Math.random() * base);
      }
    }
  }

  clarifyCourse(input: Parameters<LearningModel["clarifyCourse"]>[0]) {
    const webFetch = !input.linkContext && containsUrl(input.topic, ...input.answers.map((a) => a.answer));
    return this.run("clarify", this.models.clarify, P.clarifyPrompt(input), ClarificationResultSchema, undefined, { webFetch });
  }
  compileCurriculum(input: Parameters<LearningModel["compileCurriculum"]>[0]) {
    const webFetch = !input.linkContext && containsUrl(input.topic, input.goalText, input.baseline, input.adjustment);
    return this.run(
      "compile",
      this.models.compile,
      P.compilePrompt(input),
      CurriculumProposalSchema,
      (v) => {
        const r = validateCurriculum(v);
        return r.ok ? { ok: true, value: r.value } : r;
      },
      { webFetch },
    );
  }
  expandCurriculum(input: Parameters<LearningModel["expandCurriculum"]>[0]) {
    const webFetch = containsUrl(input.request);
    return this.run("expand", this.models.compile, P.expandPrompt(input), CurriculumExpansionSchema, undefined, { webFetch });
  }
  generateActivity(input: Parameters<LearningModel["generateActivity"]>[0]) {
    return this.run("activity", this.models.tutor, P.activityPrompt(input), ActivityGenSchema, (v) =>
      v.kind === input.kind ? { ok: true, value: v } : { ok: false, errors: [`kind must be "${input.kind}"`] },
    );
  }
  evaluateAnswer(input: Parameters<LearningModel["evaluateAnswer"]>[0]) {
    return this.run("evaluate", this.models.evaluate, P.evaluatePrompt(input), EvaluationResultSchema);
  }
  explainDifferently(input: Parameters<LearningModel["explainDifferently"]>[0]) {
    return this.run("explain", this.models.tutor, P.explainPrompt(input), ExplanationResultSchema);
  }
  hint(input: Parameters<LearningModel["hint"]>[0]) {
    return this.run("hint", this.models.tutor, P.hintPrompt(input), HintResultSchema);
  }
}

export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    const v = JSON.parse(trimmed);
    return v && typeof v === "object" && !Array.isArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
}
