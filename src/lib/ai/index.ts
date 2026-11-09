import { env, usingMockModel } from "@/lib/env";
import { db } from "@/lib/db/client";
import { AppError, ModelError } from "@/lib/errors";
import type { LearningModel, WithInfo } from "./model-adapter";
import { MockLearningModel } from "./mock-model";
import { DEEP_OPS, FAST_OPS, LLMLearningModel, OpenAITransport, type Op } from "./openai-model";
import { AnthropicTransport } from "./anthropic-model";
import { FallbackLearningModel } from "./fallback-model";

const g = globalThis as unknown as { __adaModel?: LearningModel; __adaModelOverride?: LearningModel };

export function getModel(): LearningModel {
  if (g.__adaModelOverride) return g.__adaModelOverride;
  if (!g.__adaModel) g.__adaModel = buildModel();
  return g.__adaModel;
}

/** Builds the configured provider chain: primary (+ the other provider as fallback when both keys exist). */
export function buildModel(): LearningModel {
  const e = env();
  if (usingMockModel()) return new MockLearningModel();
  const openai = e.OPENAI_API_KEY
    ? new LLMLearningModel(
        new OpenAITransport(e.OPENAI_API_KEY, e.OPENAI_BASE_URL),
        { clarify: e.ADA_MODEL_CLARIFY, compile: e.ADA_MODEL_COMPILE, tutor: e.ADA_MODEL_TUTOR, evaluate: e.ADA_MODEL_EVALUATE },
        { timeoutMs: e.ADA_MODEL_TIMEOUT_MS, provider: "openai" },
      )
    : null;
  const anthropic = e.ANTHROPIC_API_KEY
    ? new LLMLearningModel(
        new AnthropicTransport(e.ANTHROPIC_API_KEY),
        { clarify: e.ADA_ANTHROPIC_MODEL_CLARIFY, compile: e.ADA_ANTHROPIC_MODEL_COMPILE, tutor: e.ADA_ANTHROPIC_MODEL_TUTOR, evaluate: e.ADA_ANTHROPIC_MODEL_EVALUATE },
        { timeoutMs: e.ADA_MODEL_TIMEOUT_MS, provider: "anthropic", effortByOp: anthropicEffortByOp() },
      )
    : null;
  const preferAnthropic = e.ADA_MODEL_PROVIDER === "anthropic" || (!e.ADA_MODEL_PROVIDER && !openai);
  const primary = (preferAnthropic ? anthropic : openai)!;
  const secondary = preferAnthropic ? openai : anthropic;
  return secondary && e.ADA_MODEL_FALLBACK ? new FallbackLearningModel(primary, secondary) : primary;
}

/** Test hook: substitute a model implementation (never used by app code). */
export function setModelOverride(m: LearningModel | undefined) {
  g.__adaModelOverride = m;
}

/** Enforces per-user model-call ceilings (rate limit + daily budget). */
export async function assertModelBudget(ownerId: string) {
  const e = env();
  const [row] = await db()<{ minute: number; day: number; is_guest: boolean }[]>`
    select
      (select count(*) from model_usage m where m.owner_id = u.id and m.created_at > now() - interval '1 minute')::int as minute,
      (select count(*) from model_usage m where m.owner_id = u.id and m.created_at > now() - interval '1 day')::int as day,
      u.is_guest
    from users u where u.id = ${ownerId}`;
  if (!row) throw new AppError("unauthenticated", "Please sign in.");
  if (row.minute >= e.ADA_MODEL_CALLS_PER_MINUTE) throw new AppError("rate_limited", "You're going a little fast. Try again in a minute.", true);
  if (row.is_guest && row.day >= e.ADA_GUEST_MODEL_CALLS_PER_DAY) {
    throw new AppError("account_required", "You've reached today's guest limit. Create a free account to keep going.");
  }
  if (row.day >= e.ADA_MODEL_CALLS_PER_DAY) throw new AppError("rate_limited", "Daily generation limit reached. Try again tomorrow.", false);
}

/** Runs a model operation for a user with budget checks and usage logging (no prompt/answer text is stored). */
export async function callModel<T>(ownerId: string, operation: string, fn: (m: LearningModel) => Promise<WithInfo<T>>): Promise<WithInfo<T>> {
  await assertModelBudget(ownerId);
  const model = getModel();
  const started = Date.now();
  try {
    const out = await fn(model);
    await db()`insert into model_usage (owner_id, operation, provider, model, ok, latency_ms, input_tokens, output_tokens)
      values (${ownerId}, ${operation}, ${out.info.provider}, ${out.info.model}, true, ${out.info.latencyMs}, ${out.info.inputTokens ?? null}, ${out.info.outputTokens ?? null})`;
    return out;
  } catch (err) {
    const code = err instanceof AppError ? err.code : "internal";
    await db()`insert into model_usage (owner_id, operation, provider, model, ok, latency_ms, error_code)
      values (${ownerId}, ${operation}, ${model.provider}, 'unknown', false, ${Date.now() - started}, ${code})`.catch(() => {});
    if (err instanceof AppError) throw err;
    throw new ModelError("model_unavailable", "The model failed unexpectedly.", true);
  }
}

/**
 * Per-operation reasoning effort for Claude. Quick learner-facing operations
 * default to "low" (snappier), planning and grading to "medium".
 */
export function anthropicEffortByOp(): Record<Op, string> {
  const e = env();
  const fast = e.ADA_ANTHROPIC_EFFORT_FAST ?? e.ADA_ANTHROPIC_EFFORT ?? "low";
  const deep = e.ADA_ANTHROPIC_EFFORT_DEEP ?? e.ADA_ANTHROPIC_EFFORT ?? "medium";
  return Object.fromEntries([...FAST_OPS.map((op) => [op, fast]), ...DEEP_OPS.map((op) => [op, deep])]) as Record<Op, string>;
}
