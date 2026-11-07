import { describe, expect, it } from "vitest";
import { computeMastery, displayStatus, type EvidenceRecord } from "@/lib/learning/mastery";
import { INTERVAL_LADDER, initialReview, nextReview, postpone, formatInZone } from "@/lib/learning/review-scheduler";
import { estimateReadiness } from "@/lib/learning/readiness";
import { topoOrder, validateCurriculum, validateExpansion } from "@/lib/learning/curriculum";
import { chooseNext, type PlannerConcept } from "@/lib/learning/next-action";
import { CurriculumProposalSchema, MultipleChoiceGenSchema, type CurriculumProposal } from "@/lib/schemas/model";

const t0 = new Date("2026-01-01T12:00:00Z");
const ev = (o: Partial<EvidenceRecord> & { activityId: string }, minutes = 0): EvidenceRecord => ({
  result: "correct",
  independence: "independent",
  difficulty: 1,
  purpose: "check",
  createdAt: new Date(t0.getTime() + minutes * 60_000),
  ...o,
});

describe("mastery policy", () => {
  it("no evidence → not assessed; exposure alone doesn't count", () => {
    expect(computeMastery([]).status).toBe("not_assessed");
    expect(computeMastery([ev({ activityId: "a", result: "exposure" })]).status).toBe("not_assessed");
  });
  it("one easy success is developing", () => {
    expect(computeMastery([ev({ activityId: "a" })]).status).toBe("developing");
  });
  it("two independent successes incl. difficulty ≥2 → demonstrated (provisional)", () => {
    const m = computeMastery([ev({ activityId: "a" }), ev({ activityId: "b", difficulty: 2 }, 5)]);
    expect(m.status).toBe("demonstrated");
    expect(m.confidence).toBe("provisional");
  });
  it("two easy successes are not enough", () => {
    expect(computeMastery([ev({ activityId: "a" }), ev({ activityId: "b" }, 1)]).status).toBe("developing");
  });
  it("the same activity twice is not two pieces of evidence", () => {
    expect(computeMastery([ev({ activityId: "a", difficulty: 2 }), ev({ activityId: "a", difficulty: 2 }, 1)]).status).toBe("developing");
  });
  it("assisted successes never demonstrate", () => {
    const m = computeMastery([
      ev({ activityId: "a", independence: "assisted", difficulty: 2 }),
      ev({ activityId: "b", independence: "assisted", difficulty: 3 }, 1),
      ev({ activityId: "c", independence: "assisted", difficulty: 2 }, 2),
    ]);
    expect(m.status).toBe("developing");
    expect(m.details.reason).toMatch(/with help/i);
  });
  it("a delayed successful review consolidates", () => {
    const m = computeMastery([ev({ activityId: "a" }), ev({ activityId: "b", difficulty: 2 }, 5), ev({ activityId: "c", difficulty: 2, purpose: "review" }, 60 * 24 + 10)]);
    expect(m.confidence).toBe("consolidated");
  });
  it("a latest miss drops back to developing", () => {
    expect(computeMastery([ev({ activityId: "a" }), ev({ activityId: "b", difficulty: 2 }, 5), ev({ activityId: "c", result: "incorrect" }, 9)]).status).toBe("developing");
  });
  it("review due overlays only evidenced concepts", () => {
    const past = new Date(Date.now() - 1000);
    expect(displayStatus("developing", past)).toBe("review_due");
    expect(displayStatus("not_assessed", past)).toBe("not_assessed");
    expect(displayStatus("demonstrated", new Date(Date.now() + 1e6))).toBe("demonstrated");
  });
});

describe("review scheduler", () => {
  it("first review is +1 day, then follows the ladder on independent success", () => {
    const r0 = initialReview(t0);
    expect(r0.dueAt.getTime() - t0.getTime()).toBe(864e5);
    let state = { intervalDays: r0.intervalDays, repetitions: r0.repetitions };
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      const n = nextReview(state, { result: "correct", independence: "independent" }, t0);
      seen.push(n.intervalDays);
      state = n;
    }
    expect(seen).toEqual([3, 7, 14, 30, 30]);
    expect(INTERVAL_LADDER).toEqual([1, 3, 7, 14, 30]);
  });
  it("incorrect resets, partial shortens, assisted does not expand", () => {
    expect(nextReview({ intervalDays: 14, repetitions: 3 }, { result: "incorrect", independence: "independent" }, t0)).toMatchObject({ intervalDays: 1, repetitions: 0 });
    expect(nextReview({ intervalDays: 14, repetitions: 3 }, { result: "partial", independence: "independent" }, t0).intervalDays).toBe(7);
    expect(nextReview({ intervalDays: 7, repetitions: 2 }, { result: "correct", independence: "assisted" }, t0)).toMatchObject({ intervalDays: 7, repetitions: 2 });
  });
  it("postpone moves forward from now or the due date and is bounded", () => {
    const now = t0;
    expect(postpone(new Date(t0.getTime() - 864e5), 1, now).getTime()).toBe(t0.getTime() + 864e5);
    expect(postpone(t0, 100, now).getTime()).toBe(t0.getTime() + 14 * 864e5);
  });
  it("formats absolute timestamps in the learner's zone", () => {
    expect(formatInZone(t0, "America/Los_Angeles")).toMatch(/4:00\sAM/);
    expect(formatInZone(t0, "Asia/Tokyo")).toMatch(/9:00\sPM/);
    expect(formatInZone(t0, "Bogus/Zone")).toMatch(/12:00\sPM/);
  });
});

describe("readiness", () => {
  const c = (slug: string, status: "not_assessed" | "developing" | "demonstrated", evidenceCount = 2, importance = 2, prerequisites: string[] = []) => ({ slug, title: slug, status, importance, prerequisites, evidenceCount });
  it("says not enough evidence when under-assessed", () => {
    expect(estimateReadiness([c("a", "developing", 1), c("b", "not_assessed", 0)]).band).toBe("unknown");
  });
  it("bands by coverage of core concepts, never a percentage", () => {
    expect(estimateReadiness([c("a", "developing"), c("b", "not_assessed", 1)]).band).toBe("developing");
    expect(estimateReadiness([c("a", "demonstrated"), c("b", "demonstrated"), c("c", "developing")]).band).toBe("approaching");
    const all = estimateReadiness([c("a", "demonstrated"), c("b", "demonstrated")]);
    expect(all.band).toBe("demonstrated");
    expect(all.basis).not.toMatch(/%/);
  });
  it("names prerequisite bottlenecks", () => {
    const r = estimateReadiness([c("a", "not_assessed", 2), c("b", "demonstrated", 2, 2, ["a"]), c("x", "demonstrated")]);
    expect(r.basis).toMatch(/Prerequisite still to show: a/);
  });
});

const concept = (slug: string, prerequisites: string[] = []) => ({ slug, title: slug.toUpperCase(), description: "d", assessment_criteria: ["can explain"], importance: 2, prerequisites });
const proposal = (concepts: CurriculumProposal["concepts"], first = concepts[0]?.slug ?? "x"): CurriculumProposal =>
  CurriculumProposalSchema.parse({ title: "T", direction: "D", concepts, first_concept_slug: first, success_criteria: [] });

describe("curriculum validation", () => {
  it("accepts a valid graph and orders prerequisites first", () => {
    const r = validateCurriculum(proposal([concept("c", ["b"]), concept("a"), concept("b", ["a"])], "a"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.concepts.map((x) => x.slug)).toEqual(["a", "b", "c"]);
  });
  it("rejects duplicate slugs, unknown refs, cycles and size limits", () => {
    expect(validateCurriculum(proposal([concept("a"), concept("a"), concept("b")]))).toMatchObject({ ok: false });
    expect(validateCurriculum(proposal([concept("a", ["zzz"]), concept("b"), concept("c")]))).toMatchObject({ ok: false });
    const cyc = validateCurriculum(proposal([concept("a", ["c"]), concept("b", ["a"]), concept("c", ["b"])]));
    expect(cyc.ok).toBe(false);
    if (!cyc.ok) expect(cyc.errors.join()).toMatch(/cycle/);
    expect(validateCurriculum(proposal([concept("a"), concept("b")]))).toMatchObject({ ok: false });
    expect(() => proposal(Array.from({ length: 31 }, (_, i) => concept(`n${i}`)))).toThrow();
  });
  it("repairs a first concept that has prerequisites", () => {
    const r = validateCurriculum(proposal([concept("a"), concept("b", ["a"]), concept("c")], "b"));
    expect(r.ok && r.value.first_concept_slug).toBe("a");
  });
  it("normalises slugs", () => {
    const p = proposal([concept("Hello World!"), concept("b"), concept("c")]);
    expect(p.concepts[0].slug).toBe("hello-world");
  });
  it("topoOrder returns null on cycles", () => {
    expect(topoOrder([{ slug: "a", prerequisites: ["b"] }, { slug: "b", prerequisites: ["a"] }])).toBeNull();
  });
  it("expansion rejects slug collisions and unknown anchors", () => {
    const base = { anchor_slug: null, keep_slugs: [], direction: "", success_criteria: [], explanation: "" };
    expect(validateExpansion({ ...base, new_concepts: [concept("a")] }, ["a"], "branch").ok).toBe(false);
    expect(validateExpansion({ ...base, anchor_slug: "nope", new_concepts: [concept("x")] }, ["a"], "branch").ok).toBe(false);
    expect(validateExpansion({ ...base, new_concepts: [concept("x", ["a"])] }, ["a"], "branch").ok).toBe(true);
  });
});

describe("activity schema", () => {
  it("rejects MC whose answer isn't a choice or with duplicate choices", () => {
    const base = { kind: "multiple_choice", promptMarkdown: "Q", rationale: "R", difficulty: 1 };
    expect(MultipleChoiceGenSchema.safeParse({ ...base, choices: [{ id: "a", text: "1" }, { id: "b", text: "2" }, { id: "c", text: "3" }], correctChoiceId: "z" }).success).toBe(false);
    expect(MultipleChoiceGenSchema.safeParse({ ...base, choices: [{ id: "a", text: "1" }, { id: "b", text: "1" }, { id: "c", text: "3" }], correctChoiceId: "a" }).success).toBe(false);
    expect(MultipleChoiceGenSchema.safeParse({ ...base, choices: [{ id: "a", text: "1" }, { id: "b", text: "2" }, { id: "c", text: "3" }], correctChoiceId: "a" }).success).toBe(true);
  });
});

describe("next-action planner", () => {
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
  const base = { sessionKind: "lesson" as const, intent: "goal" as const, sessionSteps: [], dueReviews: [] };

  it("predicts before teaching, then teaches", () => {
    expect(chooseNext({ ...base, concepts: [pc("c1")] })).toMatchObject({ kind: "multiple_choice", purpose: "prediction" });
    const h = { explained: false, predicted: true, assessments: 0, lastAssessKind: null, reviewActivities: 0 };
    expect(chooseNext({ ...base, concepts: [pc("c1", { history: h })] })).toMatchObject({ kind: "explanation", purpose: "teach" });
  });
  it("respects prerequisites", () => {
    const d = chooseNext({ ...base, concepts: [pc("c2", { prerequisiteIds: ["c1"], position: 0 }), pc("c1", { position: 1 })] });
    expect(d).toMatchObject({ conceptId: "c1" });
  });
  it("remediates after a miss, then retries", () => {
    const steps = [{ conceptId: "c1", kind: "multiple_choice" as const, purpose: "check" as const, result: "incorrect" as const }];
    expect(chooseNext({ ...base, concepts: [pc("c1")], sessionSteps: steps })).toMatchObject({ kind: "explanation", purpose: "remediate" });
    const steps2 = [...steps, { conceptId: "c1", kind: "explanation" as const, purpose: "remediate" as const, result: null }];
    expect(chooseNext({ ...base, concepts: [pc("c1")], sessionSteps: steps2 })).toMatchObject({ kind: "multiple_choice", purpose: "check", difficulty: 2 });
  });
  it("review sessions use due items with alternating fresh variants and stop when done", () => {
    const concepts = [pc("c1", { status: "demonstrated", history: { explained: true, predicted: true, assessments: 3, lastAssessKind: "free_response", reviewActivities: 1 } })];
    const d = chooseNext({ ...base, sessionKind: "review", concepts, dueReviews: [{ reviewItemId: "r1", conceptId: "c1" }] });
    expect(d).toMatchObject({ purpose: "review", kind: "free_response", reviewItemId: "r1" });
    const done = chooseNext({ ...base, sessionKind: "review", concepts, dueReviews: [{ reviewItemId: "r1", conceptId: "c1" }], sessionSteps: [{ conceptId: "c1", kind: "free_response", purpose: "review", result: "correct" }] });
    expect(done.action).toBe("complete");
  });
  it("lessons are bounded and curiosity sessions end with a reflection", () => {
    const steps = Array.from({ length: 5 }, () => ({ conceptId: "c1", kind: "multiple_choice" as const, purpose: "check" as const, result: "correct" as const }));
    expect(chooseNext({ ...base, intent: "curiosity", concepts: [pc("c1"), pc("c2")], sessionSteps: steps })).toMatchObject({ kind: "reflection" });
    expect(chooseNext({ ...base, concepts: [pc("c1")], sessionSteps: [...steps, steps[0]] }).action).toBe("complete");
  });
  it("uses learner-selected focus", () => {
    expect(chooseNext({ ...base, concepts: [pc("c1"), pc("c9")], focusConceptId: "c9" })).toMatchObject({ conceptId: "c9" });
  });
});
