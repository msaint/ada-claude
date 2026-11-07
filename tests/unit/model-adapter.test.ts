import { describe, expect, it } from "vitest";
import { LLMLearningModel, parseJsonObject, type JsonTransport } from "@/lib/ai/openai-model";
import { MockLearningModel, subjectOf } from "@/lib/ai/mock-model";
import { ModelError } from "@/lib/errors";
import { redact } from "@/lib/log";
import { shuffleChoices } from "@/lib/services/sessions";
import { toLearnerActivity } from "@/lib/services/sessions";
import type { ActivitySpec } from "@/lib/schemas/model";

process.env.ADA_SILENT_LOGS = "true";

const models = { clarify: "m-clarify", compile: "m-compile", tutor: "m-tutor", evaluate: "m-eval" };

function scripted(outputs: (string | Error)[]) {
  const calls: { model: string; user: string; maxTokens: number }[] = [];
  const transport: JsonTransport = {
    async complete(req) {
      calls.push(req);
      const next = outputs.shift();
      if (next === undefined) throw new Error("no more scripted outputs");
      if (next instanceof Error) throw next;
      return { text: next, inputTokens: 10, outputTokens: 5 };
    },
  };
  return { transport, calls };
}

const goodCurriculum = JSON.stringify({
  title: "Ball bearings in bicycles",
  direction: "Explore how ball bearings changed cycling.",
  concepts: [
    { slug: "friction", title: "Rolling vs sliding friction", description: "Why rolling wins.", assessment_criteria: ["Compare rolling and sliding friction"], importance: 3, prerequisites: [] },
    { slug: "races", title: "Cups, cones and races", description: "Parts of a bearing.", assessment_criteria: ["Name the parts"], importance: 2, prerequisites: ["friction"] },
    { slug: "history", title: "The 1869 shift", description: "Adoption history.", assessment_criteria: ["Explain the adoption"], importance: 2, prerequisites: ["races"] },
  ],
  first_concept_slug: "friction",
  suggested_minutes_weekly: 30,
  cadence_note: "Short sessions.",
  success_criteria: [],
});

const ctx = { topic: "history of ball bearings in bicycles", intent: "curiosity" as const, goalText: "Explore", depth: "standard", baseline: "", timeBudgetMinutesWeekly: null, successCriteria: [], assumptions: [] };

describe("LLM adapter", () => {
  it("parses valid structured output and reports usage", async () => {
    const { transport, calls } = scripted([goodCurriculum]);
    const m = new LLMLearningModel(transport, models, { timeoutMs: 1000 });
    const r = await m.compileCurriculum(ctx);
    expect(r.value.concepts).toHaveLength(3);
    expect(r.info).toMatchObject({ provider: "openai", model: "m-compile", repaired: false, inputTokens: 10 });
    expect(calls[0].user).toContain("JSON Schema");
    expect(calls[0].user).toContain('<learner_data name="topic">');
  });

  it("repairs once after malformed JSON", async () => {
    const { transport, calls } = scripted(["not json", goodCurriculum]);
    const r = await new LLMLearningModel(transport, models, { timeoutMs: 1000 }).compileCurriculum(ctx);
    expect(r.info.repaired).toBe(true);
    expect(calls[1].user).toContain("previous output was invalid");
  });

  it("repairs a cyclic graph once, then fails cleanly", async () => {
    const cyclic = JSON.parse(goodCurriculum);
    cyclic.concepts[0].prerequisites = ["history"];
    const { transport, calls } = scripted([JSON.stringify(cyclic), JSON.stringify(cyclic)]);
    await expect(new LLMLearningModel(transport, models, { timeoutMs: 1000 }).compileCurriculum(ctx)).rejects.toMatchObject({ code: "model_invalid_output", retryable: true });
    expect(calls).toHaveLength(2);
    expect(calls[1].user).toContain("cycle");
  });

  it("retries transient failures with backoff and then succeeds", async () => {
    const e429 = Object.assign(new Error("rate"), { status: 429 });
    const { transport, calls } = scripted([e429, Object.assign(new Error("boom"), { status: 503 }), goodCurriculum]);
    const r = await new LLMLearningModel(transport, models, { timeoutMs: 1000, retryBaseMs: 1 }).compileCurriculum(ctx);
    expect(r.value.title).toBe("Ball bearings in bicycles");
    expect(calls).toHaveLength(3);
  });

  it("maps timeouts to a retryable model_timeout without looping forever", async () => {
    const timeout = Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" });
    const { transport, calls } = scripted([timeout, timeout, timeout, timeout]);
    const err = await new LLMLearningModel(transport, models, { timeoutMs: 10, retryBaseMs: 1, maxTransientRetries: 2 }).compileCurriculum(ctx).catch((e) => e);
    expect(err).toBeInstanceOf(ModelError);
    expect(err.code).toBe("model_timeout");
    expect(calls).toHaveLength(3);
  });

  it("does not retry non-transient errors", async () => {
    const { transport, calls } = scripted([Object.assign(new Error("bad key"), { status: 401 })]);
    await expect(new LLMLearningModel(transport, models, { timeoutMs: 10 }).compileCurriculum(ctx)).rejects.toMatchObject({ code: "model_unavailable" });
    expect(calls).toHaveLength(1);
  });

  it("enforces the requested activity kind", async () => {
    const mc = JSON.stringify({ kind: "multiple_choice", promptMarkdown: "Q?", choices: [{ id: "a", text: "1" }, { id: "b", text: "2" }, { id: "c", text: "3" }], correctChoiceId: "a", rationale: "R", difficulty: 1 });
    const { transport } = scripted([mc, mc]);
    const m = new LLMLearningModel(transport, models, { timeoutMs: 10 });
    const concept = { slug: "x", title: "X", description: "", assessmentCriteria: ["c"], prerequisites: [] };
    await expect(
      m.generateActivity({ topic: "t", intent: "goal", goalText: "g", baseline: "", timeBudgetMinutesWeekly: null, concept, kind: "explanation", purpose: "teach", difficulty: 1, recentEvidence: [], misconceptions: [], priorPrompts: [], assistanceUsed: 0 }),
    ).rejects.toMatchObject({ code: "model_invalid_output" });
  });

  it("parses fenced JSON and rejects arrays", () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonObject("[1,2]")).toBeUndefined();
  });
});

describe("dev model", () => {
  it("is generic (no topic templates) and deterministic", async () => {
    const m = new MockLearningModel();
    const a = await m.compileCurriculum({ ...ctx, topic: "history of ball bearings in bicycles" });
    const b = await m.compileCurriculum({ ...ctx, topic: "history of ball bearings in bicycles" });
    expect(a.value).toEqual(b.value);
    expect(a.info.provider).toBe("mock");
    expect(a.value.title.toLowerCase()).toContain("ball bearings");
    expect(subjectOf("I want to learn Python to automate spreadsheet tasks")).toBe("Python to automate spreadsheet tasks");
  });
});

describe("activity DTO and shuffling", () => {
  const spec: ActivitySpec = {
    version: 1,
    conceptId: "c",
    kind: "multiple_choice",
    promptMarkdown: "Q",
    choices: [
      { id: "x", text: "one" },
      { id: "y", text: "two" },
      { id: "z", text: "three" },
    ],
    correctChoiceId: "y",
    rationale: "secret rationale",
    difficulty: 2,
  };
  it("relabels choices and keeps the answer mapped correctly", () => {
    const s = shuffleChoices(spec as Extract<ActivitySpec, { kind: "multiple_choice" }>, () => 0);
    expect(s.choices.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(s.choices.find((c) => c.id === s.correctChoiceId)!.text).toBe("two");
  });
  it("learner DTO never contains teacher-only fields", () => {
    const dto = toLearnerActivity({ id: "1", purpose: "check", spec_json: spec }, "C");
    expect(JSON.stringify(dto)).not.toMatch(/correctChoiceId|secret rationale/);
    const fr = toLearnerActivity({ id: "2", purpose: "apply", spec_json: { version: 1, conceptId: "c", kind: "free_response", promptMarkdown: "Explain", rubric: [{ criterion: "hidden crit", importance: 1 }], idealAnswerPrivate: "hidden ideal", difficulty: 2 } }, "C");
    expect(JSON.stringify(fr)).not.toMatch(/hidden/);
  });
});

describe("log redaction", () => {
  it("redacts emails, secrets and answer text", () => {
    const out = JSON.stringify(redact({ email: "a@b.co", note: "contact a@b.co with sk-abcdefghijklmnop", answerText: "my private answer" }));
    expect(out).not.toMatch(/a@b\.co|sk-abc|private answer/);
  });
});
