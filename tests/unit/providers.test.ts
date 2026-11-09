import { afterEach, describe, expect, it } from "vitest";
import { FallbackLearningModel } from "@/lib/ai/fallback-model";
import { MockLearningModel } from "@/lib/ai/mock-model";
import { buildModel } from "@/lib/ai";
import { resetEnvCache } from "@/lib/env";
import { connectionOptions } from "@/lib/db/options";
import { AppError, ModelError } from "@/lib/errors";
import type { LearningModel } from "@/lib/ai/model-adapter";

process.env.ADA_SILENT_LOGS = "true";
const ctx = { topic: "Knots", answers: [], askedFields: [], questionsAsked: 0, maxQuestions: 4, startNow: true, linkContext: null };

function failing(err: Error): LearningModel {
  const m = new MockLearningModel();
  return new Proxy(m, { get: (t, k) => (k === "provider" ? "broken" : typeof (t as never)[k] === "function" ? async () => { throw err; } : (t as never)[k]) });
}

describe("cross-provider fallback", () => {
  it("uses the secondary provider when the primary times out", async () => {
    const m = new FallbackLearningModel(failing(new ModelError("model_timeout", "slow")), new MockLearningModel());
    const r = await m.clarifyCourse(ctx);
    expect(r.info.provider).toBe("mock");
  });
  it("does not mask non-model errors", async () => {
    const m = new FallbackLearningModel(failing(new AppError("rate_limited", "x")), new MockLearningModel());
    await expect(m.clarifyCourse(ctx)).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("provider selection", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvCache();
  });
  const configure = (env: Record<string, string | undefined>) => {
    process.env = { ...saved, MOCK_MODEL: "false", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", ADA_MODEL_PROVIDER: "", ...env };
    resetEnvCache();
    return buildModel().provider;
  };
  it("picks the only configured provider", () => {
    expect(configure({ ANTHROPIC_API_KEY: "sk-ant-test" })).toBe("anthropic");
    expect(configure({ OPENAI_API_KEY: "sk-test" })).toBe("openai");
  });
  it("chains both with the preferred one first, unless fallback is off", () => {
    expect(configure({ OPENAI_API_KEY: "sk-test", ANTHROPIC_API_KEY: "sk-ant-test" })).toBe("openai+anthropic");
    expect(configure({ OPENAI_API_KEY: "sk-test", ANTHROPIC_API_KEY: "sk-ant-test", ADA_MODEL_PROVIDER: "anthropic" })).toBe("anthropic+openai");
    expect(configure({ OPENAI_API_KEY: "sk-test", ANTHROPIC_API_KEY: "sk-ant-test", ADA_MODEL_FALLBACK: "false" })).toBe("openai");
  });
  it("falls back to the dev model with no keys outside production", () => {
    expect(configure({})).toBe("mock");
  });
});

describe("database connection options", () => {
  it("disables prepared statements and requires TLS for the Supabase transaction pooler", () => {
    const o = connectionOptions("postgresql://postgres.abc:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres");
    expect(o).toMatchObject({ prepare: false, ssl: "require" });
  });
  it("keeps prepared statements and plain TCP locally", () => {
    expect(connectionOptions("postgres://postgres:postgres@localhost:5432/ada_dev")).toMatchObject({ prepare: true, ssl: false });
  });
});
