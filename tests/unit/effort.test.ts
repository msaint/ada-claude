import { afterEach, describe, expect, it } from "vitest";
import { anthropicEffortByOp } from "@/lib/ai";
import { resetEnvCache } from "@/lib/env";
import { LLMLearningModel, type JsonTransport, type TransportRequest } from "@/lib/ai/openai-model";

process.env.ADA_SILENT_LOGS = "true";
const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  resetEnvCache();
});
const withEnv = (vars: Record<string, string | undefined>) => {
  process.env = { ...saved, ...vars };
  resetEnvCache();
  return anthropicEffortByOp();
};

describe("per-operation effort", () => {
  it("defaults quick operations to low and planning/grading to medium", () => {
    const e = withEnv({ ADA_ANTHROPIC_EFFORT: "", ADA_ANTHROPIC_EFFORT_FAST: "", ADA_ANTHROPIC_EFFORT_DEEP: "" });
    expect(e).toMatchObject({ activity: "low", hint: "low", explain: "low", clarify: "low", compile: "medium", expand: "medium", evaluate: "medium" });
  });
  it("honours overrides, with the global setting as a fallback", () => {
    expect(withEnv({ ADA_ANTHROPIC_EFFORT: "high", ADA_ANTHROPIC_EFFORT_FAST: "", ADA_ANTHROPIC_EFFORT_DEEP: "" })).toMatchObject({ activity: "high", evaluate: "high" });
    expect(withEnv({ ADA_ANTHROPIC_EFFORT_FAST: "medium", ADA_ANTHROPIC_EFFORT_DEEP: "xhigh" })).toMatchObject({ activity: "medium", compile: "xhigh" });
  });
  it("is passed to the transport for each operation", async () => {
    const calls: TransportRequest[] = [];
    const t: JsonTransport = {
      async complete(r) {
        calls.push(r);
        return { text: JSON.stringify({ hintMarkdown: "Think about the cause." }) };
      },
    };
    const m = new LLMLearningModel(t, { clarify: "c", compile: "c", tutor: "t", evaluate: "e" }, { timeoutMs: 10, effortByOp: { hint: "low" } });
    await m.hint({ topic: "x", concept: { slug: "a", title: "A", description: "", assessmentCriteria: [], prerequisites: [] }, promptMarkdown: "Q", previousHints: [], answerKey: "k" });
    expect(calls[0].effort).toBe("low");
  });
});
