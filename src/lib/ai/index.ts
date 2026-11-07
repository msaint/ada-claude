import { env, usingMockModel } from "@/lib/env";
import { db } from "@/lib/db/client";
import { AppError, ModelError } from "@/lib/errors";
import type { LearningModel, WithInfo } from "./model-adapter";
import { MockLearningModel } from "./mock-model";
import { LLMLearningModel, OpenAITransport } from "./openai-model";

const g = globalThis as unknown as { __adaModel?: LearningModel; __adaModelOverride?: LearningModel };

export function getModel(): LearningModel {
  if (g.__adaModelOverride) return g.__adaModelOverride;
  if (!g.__adaModel) {
    const e = env();
    g.__adaModel = usingMockModel()
      ? new MockLearningModel()
      : new LLMLearningModel(
          new OpenAITransport(e.OPENAI_API_KEY!, e.OPENAI_BASE_URL),
          { clarify: e.ADA_MODEL_CLARIFY, compile: e.ADA_MODEL_COMPILE, tutor: e.ADA_MODEL_TUTOR, evaluate: e.ADA_MODEL_EVALUATE },
          { timeoutMs: e.ADA_MODEL_TIMEOUT_MS },
        );
  }
  return g.__adaModel;
}

/** Test hook: substitute a model implementation (never used by app code). */
export function setModelOverride(m: LearningModel | undefined) {
  g.__adaModelOverride = m;
}

/** Enforces per-user model-call ceilings (rate limit + daily budget). */
export async function assertModelBudget(ownerId: string) {
  const e = env();
  const [row] = await db()<{ minute: number; day: number }[]>`
    select
      count(*) filter (where created_at > now() - interval '1 minute')::int as minute,
      count(*) filter (where created_at > now() - interval '1 day')::int as day
    from model_usage where owner_id = ${ownerId} and created_at > now() - interval '1 day'`;
  if (row.minute >= e.ADA_MODEL_CALLS_PER_MINUTE) throw new AppError("rate_limited", "You're going a little fast. Try again in a minute.", true);
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
