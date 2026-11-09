import { describe, expect, it } from "vitest";
import { computeMastery, type EvidenceRecord } from "@/lib/learning/mastery";
import { chooseNext, spread, type PlannerConcept, type SessionStep } from "@/lib/learning/next-action";

const t0 = new Date("2026-01-01T12:00:00Z");
const ev = (o: Partial<EvidenceRecord> & { activityId: string }, minutes = 0): EvidenceRecord => ({
  result: "correct",
  independence: "independent",
  difficulty: 1,
  purpose: "check",
  recall: "unprompted",
  createdAt: new Date(t0.getTime() + minutes * 60_000),
  ...o,
});

describe("unprompted recall rule", () => {
  it("successes given right after practising the same concept don't demonstrate on their own", () => {
    const m = computeMastery([ev({ activityId: "a", recall: "prompted" }), ev({ activityId: "b", difficulty: 2, recall: "prompted" }, 1)]);
    expect(m.status).toBe("developing");
    expect(m.details.needsRecall).toBe(true);
    expect(m.details.reason).toMatch(/unprompted recall/);
  });
  it("one later unprompted success completes the evidence", () => {
    const m = computeMastery([
      ev({ activityId: "a", recall: "prompted" }),
      ev({ activityId: "b", difficulty: 2, recall: "prompted" }, 1),
      ev({ activityId: "c", purpose: "recall", difficulty: 2, recall: "unprompted" }, 10),
    ]);
    expect(m.status).toBe("demonstrated");
    expect(m.details.needsRecall).toBe(false);
  });
  it("pre-teaching predictions never count as proof", () => {
    const m = computeMastery([ev({ activityId: "p", purpose: "prediction" }), ev({ activityId: "b", difficulty: 2, recall: "prompted" }, 5)]);
    expect(m.status).toBe("developing");
    expect(m.details.independentSuccesses).toBe(1);
  });
  it("placement successes are real, unprompted evidence", () => {
    const m = computeMastery([ev({ activityId: "p", purpose: "placement", difficulty: 2 }), ev({ activityId: "b", purpose: "apply", difficulty: 2, recall: "unprompted" }, 30)]);
    expect(m.status).toBe("demonstrated");
  });
});

const pc = (id: string, o: Partial<PlannerConcept> = {}): PlannerConcept => ({
  id,
  title: id,
  position: Number(id.replace(/\D/g, "")) || 0,
  prerequisiteIds: [],
  status: "not_assessed",
  inPlan: true,
  history: { explained: false, predicted: false, assessments: 0, lastAssessKind: null, reviewActivities: 0 },
  ...o,
});
const learned = { explained: true, predicted: true, assessments: 2, lastAssessKind: "free_response" as const, reviewActivities: 0 };
const base = { sessionKind: "lesson" as const, intent: "goal" as const, sessionSteps: [] as SessionStep[], dueReviews: [] };
const step = (conceptId: string, kind: SessionStep["kind"], purpose: SessionStep["purpose"], result: SessionStep["result"]): SessionStep => ({ conceptId, kind, purpose, result });

describe("placement diagnostic", () => {
  const concepts = ["c1", "c2", "c3", "c4", "c5", "c6", "c7"].map((id) => pc(id));
  it("spreads up to 5 probes across the course, easy to hard, then completes", () => {
    const picks: string[] = [];
    const difficulties: number[] = [];
    const steps: SessionStep[] = [];
    for (;;) {
      const d = chooseNext({ ...base, sessionKind: "placement", concepts, sessionSteps: steps });
      if (d.action === "complete") break;
      expect(d.purpose).toBe("placement");
      picks.push(d.conceptId);
      difficulties.push(d.difficulty);
      steps.push(step(d.conceptId, d.kind, d.purpose, "correct"));
    }
    expect(picks).toEqual(["c1", "c3", "c4", "c6", "c7"]);
    expect(difficulties).toEqual([1, 2, 2, 3, 3]);
    expect(spread([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });
  it("placed-out concepts skip predict/teach and go straight to an application", () => {
    const c = pc("c1", { history: { explained: false, predicted: true, assessments: 0, lastAssessKind: null, reviewActivities: 0, placedOut: true } });
    expect(chooseNext({ ...base, concepts: [c] })).toMatchObject({ kind: "free_response", purpose: "apply" });
  });
  it("a missed placement probe counts as the prediction, so teaching starts", () => {
    const c = pc("c1", { history: { explained: false, predicted: true, assessments: 0, lastAssessKind: null, reviewActivities: 0, placedOut: false } });
    expect(chooseNext({ ...base, concepts: [c] })).toMatchObject({ kind: "explanation", purpose: "teach" });
  });
});

describe("final mixed assessment", () => {
  it("asks one question per plan concept, then an integrative problem", () => {
    const concepts = [pc("c1", { status: "demonstrated" }), pc("c2", { status: "demonstrated", importance: 3 }), pc("c9", { inPlan: false })];
    const seq: string[] = [];
    const steps: SessionStep[] = [];
    for (;;) {
      const d = chooseNext({ ...base, sessionKind: "assessment", concepts, sessionSteps: steps });
      if (d.action === "complete") break;
      seq.push(`${d.purpose}:${d.conceptId}:${d.kind}`);
      steps.push(step(d.conceptId, d.kind, d.purpose, "correct"));
    }
    expect(seq).toEqual(["final:c1:multiple_choice", "final:c2:free_response", "integrative:c2:free_response"]);
  });
});

describe("Socratic lesson moves", () => {
  it("plays devil's advocate once after a correct free-response application", () => {
    const s = [step("c1", "free_response", "apply", "correct")];
    expect(chooseNext({ ...base, concepts: [pc("c1", { history: learned, status: "developing" })], sessionSteps: s })).toMatchObject({ kind: "free_response", purpose: "defend" });
    const s2 = [...s, step("c1", "free_response", "defend", "correct"), step("c1", "free_response", "apply", "correct")];
    expect(chooseNext({ ...base, concepts: [pc("c1", { history: learned, status: "developing" })], sessionSteps: s2 })).not.toMatchObject({ purpose: "defend" });
  });
  it("a miss on a devil's-advocate question gets a probe, not the answer", () => {
    const s = [step("c1", "free_response", "defend", "partial")];
    expect(chooseNext({ ...base, concepts: [pc("c1", { history: learned })], sessionSteps: s })).toMatchObject({ purpose: "probe" });
  });
  it("interleaves an unprompted recall check once other work has happened", () => {
    const c1 = pc("c1", { status: "developing", needsRecall: true, history: learned });
    const c2 = pc("c2");
    // Right after c1: move on rather than re-asking c1 immediately.
    const afterC1 = chooseNext({ ...base, concepts: [c1, c2], sessionSteps: [step("c1", "free_response", "defend", "correct")] });
    expect(afterC1).toMatchObject({ conceptId: "c2" });
    // After work on c2, come back to c1 for recall.
    const later = chooseNext({ ...base, concepts: [c1, c2], sessionSteps: [step("c1", "free_response", "defend", "correct"), step("c2", "multiple_choice", "prediction", "correct")] });
    expect(later).toMatchObject({ conceptId: "c1", purpose: "recall", kind: "multiple_choice" });
    // At the start of a new session, recall comes first.
    expect(chooseNext({ ...base, concepts: [c1, c2] })).toMatchObject({ conceptId: "c1", purpose: "recall" });
  });
  it("applies the learner's harder/easier choice to assessments only", () => {
    const c = pc("c1", { status: "developing", history: { ...learned, lastAssessKind: "multiple_choice" } });
    expect(chooseNext({ ...base, concepts: [c], difficultyOffset: 1 })).toMatchObject({ purpose: "apply", difficulty: 3 });
    expect(chooseNext({ ...base, concepts: [c], difficultyOffset: -1 })).toMatchObject({ purpose: "apply", difficulty: 1 });
    expect(chooseNext({ ...base, concepts: [pc("c2")], difficultyOffset: 1 })).toMatchObject({ purpose: "prediction", difficulty: 1 });
  });
});
