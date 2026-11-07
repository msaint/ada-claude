import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  ADA_MODEL_CLARIFY: z.string().default("gpt-4.1-mini"),
  ADA_MODEL_COMPILE: z.string().default("gpt-4.1"),
  ADA_MODEL_TUTOR: z.string().default("gpt-4.1-mini"),
  ADA_MODEL_EVALUATE: z.string().default("gpt-4.1-mini"),
  ADA_MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  ADA_MODEL_CALLS_PER_MINUTE: z.coerce.number().int().positive().default(20),
  ADA_MODEL_CALLS_PER_DAY: z.coerce.number().int().positive().default(400),
  MOCK_MODEL: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  APP_BASE_URL: z.string().default("http://localhost:3000"),
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
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  if (!parsed.data.MOCK_MODEL && !parsed.data.OPENAI_API_KEY && parsed.data.NODE_ENV === "production") {
    throw new Error("OPENAI_API_KEY is required in production (MOCK_MODEL is for development/tests only).");
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() {
  cached = null;
}

/** True when the deterministic development model is in use (explicitly, or because no key is configured outside production). */
export function usingMockModel(): boolean {
  const e = env();
  return e.MOCK_MODEL || !e.OPENAI_API_KEY;
}
