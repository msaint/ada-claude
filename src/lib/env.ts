import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Which provider serves requests first. Defaults to whichever key is set (OpenAI if both). */
  ADA_MODEL_PROVIDER: z.enum(["openai", "anthropic"]).optional(),
  /** When both keys are set, fall back to the other provider on outages/timeouts. */
  ADA_MODEL_FALLBACK: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  ADA_ANTHROPIC_MODEL_CLARIFY: z.string().default("claude-opus-5-5"),
  ADA_ANTHROPIC_MODEL_COMPILE: z.string().default("claude-opus-5-5"),
  ADA_ANTHROPIC_MODEL_TUTOR: z.string().default("claude-opus-5-5"),
  ADA_ANTHROPIC_MODEL_EVALUATE: z.string().default("claude-opus-5-5"),
  /** Fallback effort for all operations (optional). */
  ADA_ANTHROPIC_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  /** Effort for quick, learner-facing operations: setup questions, activities, hints, explanations. */
  ADA_ANTHROPIC_EFFORT_FAST: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  /** Effort for course planning, plan revisions and free-response grading. */
  ADA_ANTHROPIC_EFFORT_DEEP: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  ADA_MODEL_CLARIFY: z.string().default("gpt-4.1-mini"),
  ADA_MODEL_COMPILE: z.string().default("gpt-4.1"),
  ADA_MODEL_TUTOR: z.string().default("gpt-4.1-mini"),
  ADA_MODEL_EVALUATE: z.string().default("gpt-4.1-mini"),
  ADA_MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  ADA_MODEL_CALLS_PER_MINUTE: z.coerce.number().int().positive().default(20),
  ADA_MODEL_CALLS_PER_DAY: z.coerce.number().int().positive().default(400),
  /** Guests (no account) get a smaller daily model budget. */
  ADA_GUEST_MODEL_CALLS_PER_DAY: z.coerce.number().int().positive().default(60),
  /** New guest identities allowed per client IP per hour. */
  ADA_GUEST_CREATIONS_PER_HOUR: z.coerce.number().int().positive().default(10),
  MOCK_MODEL: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  /** Shared secret for scheduled jobs (Vercel Cron sends it as a Bearer token). */
  CRON_SECRET: z.string().min(16).optional(),
  /** Let Claude search the web while writing explanations, and show the sources: on | off. */
  ADA_WEB_GROUNDING: z.enum(["on", "off"]).default("off"),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof EnvSchema>;
let cached: Env | null = null;

/** Validated server-side environment. Throws a readable error on misconfiguration. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse({
    ...process.env,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || undefined,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || undefined,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
    ADA_MODEL_PROVIDER: process.env.ADA_MODEL_PROVIDER || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
    ADA_WEB_GROUNDING: process.env.ADA_WEB_GROUNDING || undefined,
    ADA_ANTHROPIC_EFFORT: process.env.ADA_ANTHROPIC_EFFORT || undefined,
    ADA_ANTHROPIC_EFFORT_FAST: process.env.ADA_ANTHROPIC_EFFORT_FAST || undefined,
    ADA_ANTHROPIC_EFFORT_DEEP: process.env.ADA_ANTHROPIC_EFFORT_DEEP || undefined,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const d = parsed.data;
  if (!d.MOCK_MODEL && !d.OPENAI_API_KEY && !d.ANTHROPIC_API_KEY && d.NODE_ENV === "production") {
    throw new Error("Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY in production (MOCK_MODEL is for development/tests only).");
  }
  if (d.ADA_MODEL_PROVIDER === "openai" && !d.OPENAI_API_KEY && !d.MOCK_MODEL) throw new Error("ADA_MODEL_PROVIDER=openai but OPENAI_API_KEY is not set.");
  if (d.ADA_MODEL_PROVIDER === "anthropic" && !d.ANTHROPIC_API_KEY && !d.MOCK_MODEL) throw new Error("ADA_MODEL_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.");
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() {
  cached = null;
}

/** True when the deterministic development model is in use (explicitly, or because no key is configured outside production). */
export function usingMockModel(): boolean {
  const e = env();
  return e.MOCK_MODEL || (!e.OPENAI_API_KEY && !e.ANTHROPIC_API_KEY);
}
