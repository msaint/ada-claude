import type { DisplayStatus, EvidenceResult } from "./mastery";

/**
 * Server-owned next-action policy (no LLM decides DB mutations).
 *
 * Teaching loop: predict → teach → check → apply. Socratic handling of
 * misses: first a narrower *probe* question that exposes the contradiction
 * (no answer given), and only after a second miss a direct re-teach followed
 * by a re-test from a different angle. Correct free-response answers can get
 * a devil's-advocate follow-up. Concepts that are ready except for unprompted
 * recall are interleaved back in later. Placement and final-assessment
 * sessions have their own fixed sequences. Several rules are adapted from
 * Jane Street's socratic-tutor skill (MIT).
 */

export type ActivityKind = "explanation" | "multiple_choice" | "free_response" | "reflection";
export type Purpose =
  | "prediction"
  | "teach"
  | "check"
  | "apply"
  | "remediate"
  | "probe"
  | "defend"
  | "recall"
  | "review"
  | "transfer"
  | "reflect"
  | "placement"
  | "final"
  | "integrative";
export type SessionKind = "lesson" | "review" | "placement" | "assessment";

export type PlannerConcept = {
  id: string;
  title: string;
  position: number;
  importance?: number;
  prerequisiteIds: string[];
  status: DisplayStatus;
  inPlan: boolean;
  /** Ready to be demonstrated except for an unprompted recall check. */
  needsRecall?: boolean;
  history: {
    explained: boolean;
    predicted: boolean;
    assessments: number;
    lastAssessKind: ActivityKind | null;
    reviewActivities: number;
    /** Answered a placement question correctly at difficulty ≥ 2. */
    placedOut?: boolean;
  };
};

export type SessionStep = { conceptId: string; kind: ActivityKind; purpose: Purpose; result: EvidenceResult | null };

export type PlannerInput = {
  sessionKind: SessionKind;
  intent: "curiosity" | "goal";
  concepts: PlannerConcept[];
  sessionSteps: SessionStep[];
  dueReviews: { reviewItemId: string; conceptId: string }[];
  focusConceptId?: string | null;
  /** Learner's "harder"/"easier" choice for this session: -1, 0 or +1. */
  difficultyOffset?: number;
  limits?: { lesson: number; review: number; perConcept: number };
};

export type PlannedActivity = {
  action: "activity";
  conceptId: string;
  kind: ActivityKind;
  purpose: Purpose;
  difficulty: 1 | 2 | 3;
  reviewItemId?: string;
  reason: string;
};
export type PlannerDecision = PlannedActivity | { action: "complete"; reason: string };

const DEFAULT_LIMITS = { lesson: 8, review: 3, perConcept: 5 };
export const PLACEMENT_MAX = 5;

/**
 * Lesson length follows what the learner told Ada at setup: a small weekly
 * budget or a "quick" course gets shorter sessions, a large budget longer ones.
 */
export function lessonLimits(timeBudgetMinutesWeekly: number | null | undefined, depth: string | null | undefined) {
  let lesson = DEFAULT_LIMITS.lesson;
  if (timeBudgetMinutesWeekly != null) lesson = timeBudgetMinutesWeekly <= 30 ? 5 : timeBudgetMinutesWeekly <= 120 ? 8 : 10;
  if (depth === "quick") lesson = Math.min(lesson, 5);
  return { ...DEFAULT_LIMITS, lesson };
}
export const FINAL_MAX_CONCEPTS = 8;
const ASSESSABLE: ActivityKind[] = ["multiple_choice", "free_response"];
/** Misses on these get a Socratic probe rather than an immediate answer. */
const PROBE_AFTER_MISS: Purpose[] = ["check", "apply", "transfer", "recall", "defend"];
const MISSED = (r: EvidenceResult | null) => r === "incorrect" || r === "partial";

const clampDifficulty = (d: number): 1 | 2 | 3 => Math.min(3, Math.max(1, Math.round(d))) as 1 | 2 | 3;

/** Spread `count` picks evenly across an ordered list (always includes first and last). */
export function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, i) => items[Math.round((i * (items.length - 1)) / (count - 1))]);
}

function ordered(concepts: PlannerConcept[]) {
  return [...concepts].sort((a, b) => Number(b.inPlan) - Number(a.inPlan) || a.position - b.position);
}

/** Concepts covered by a final assessment: the current plan's, most important first, capped. */
export function finalAssessmentConcepts(concepts: PlannerConcept[]): PlannerConcept[] {
  const plan = concepts.filter((c) => c.inPlan);
  if (plan.length <= FINAL_MAX_CONCEPTS) return [...plan].sort((a, b) => a.position - b.position);
  return [...plan]
    .sort((a, b) => (b.importance ?? 2) - (a.importance ?? 2) || a.position - b.position)
    .slice(0, FINAL_MAX_CONCEPTS)
    .sort((a, b) => a.position - b.position);
}

export function chooseNext(input: PlannerInput): PlannerDecision {
  switch (input.sessionKind) {
    case "review":
      return planReview(input);
    case "placement":
      return planPlacement(input);
    case "assessment":
      return planAssessment(input);
    default:
      return planLesson(input);
  }
}

function planReview(input: PlannerInput): PlannerDecision {
  const limits = input.limits ?? DEFAULT_LIMITS;
  const byId = new Map(input.concepts.map((c) => [c.id, c]));
  const reviewed = new Set(input.sessionSteps.map((s) => s.conceptId));
  const next = input.dueReviews.find((r) => !reviewed.has(r.conceptId) && byId.has(r.conceptId));
  if (input.sessionSteps.length >= limits.review || !next) return { action: "complete", reason: next ? "review_session_limit" : "no_more_due_reviews" };
  const c = byId.get(next.conceptId)!;
  const kind: ActivityKind = c.history.reviewActivities % 2 === 0 ? "multiple_choice" : "free_response";
  return { action: "activity", conceptId: c.id, kind, purpose: "review", difficulty: 2, reviewItemId: next.reviewItemId, reason: "due_review_fresh_variant" };
}

/** A few probes spanning the course, easy → hard, before any teaching. */
function planPlacement(input: PlannerInput): PlannerDecision {
  const targets = spread(
    ordered(input.concepts).filter((c) => c.inPlan),
    PLACEMENT_MAX,
  );
  const i = input.sessionSteps.length;
  if (i >= targets.length) return { action: "complete", reason: "placement_done" };
  const difficulty = targets.length === 1 ? 2 : clampDifficulty(1 + (2 * i) / (targets.length - 1));
  return {
    action: "activity",
    conceptId: targets[i].id,
    kind: difficulty === 3 ? "free_response" : "multiple_choice",
    purpose: "placement",
    difficulty,
    reason: `placement_probe_${i + 1}_of_${targets.length}`,
  };
}

/** One question per plan concept, then one integrative problem across them. */
function planAssessment(input: PlannerInput): PlannerDecision {
  const covered = finalAssessmentConcepts(input.concepts);
  const i = input.sessionSteps.length;
  if (covered.length === 0) return { action: "complete", reason: "nothing_to_assess" };
  if (i < covered.length) {
    const c = covered[i];
    return {
      action: "activity",
      conceptId: c.id,
      kind: (c.importance ?? 2) >= 3 || i % 2 === 1 ? "free_response" : "multiple_choice",
      purpose: "final",
      difficulty: 2,
      reason: "final_per_concept",
    };
  }
  if (i === covered.length) {
    return { action: "activity", conceptId: covered.at(-1)!.id, kind: "free_response", purpose: "integrative", difficulty: 3, reason: "final_integrative" };
  }
  return { action: "complete", reason: "assessment_done" };
}

function planLesson(input: PlannerInput): PlannerDecision {
  const limits = input.limits ?? DEFAULT_LIMITS;
  const steps = input.sessionSteps;
  const byId = new Map(input.concepts.map((c) => [c.id, c]));
  const offset = Math.max(-1, Math.min(1, input.difficultyOffset ?? 0));
  const act = (conceptId: string, kind: ActivityKind, purpose: Purpose, difficulty: number, reason: string): PlannedActivity => ({
    action: "activity",
    conceptId,
    kind,
    purpose,
    // Learner's harder/easier choice shifts assessments (not predictions or probes).
    difficulty: ASSESSABLE.includes(kind) && purpose !== "prediction" && purpose !== "probe" ? clampDifficulty(difficulty + offset) : clampDifficulty(difficulty),
    reason,
  });

  const hasReflection = steps.some((s) => s.kind === "reflection");
  if (steps.length >= limits.lesson) return { action: "complete", reason: "lesson_length_reached" };
  if (input.intent === "curiosity" && steps.length === limits.lesson - 1 && !hasReflection && steps.length > 0) {
    return act(steps.at(-1)!.conceptId, "reflection", "reflect", 1, "curiosity_reflection");
  }

  const last = steps.at(-1);
  // --- Socratic follow-ups to the previous step
  if (last && ASSESSABLE.includes(last.kind) && MISSED(last.result)) {
    if (last.purpose === "probe") return act(last.conceptId, "explanation", "remediate", 1, "second_miss_explain_directly");
    if (PROBE_AFTER_MISS.includes(last.purpose)) return act(last.conceptId, "multiple_choice", "probe", 1, "first_miss_socratic_probe");
  }
  if (last && last.kind === "explanation" && last.purpose === "remediate") {
    return act(last.conceptId, "multiple_choice", "check", 2, "retest_after_remediation");
  }
  if (last && last.purpose === "probe" && last.result === "correct") {
    return act(last.conceptId, "free_response", "check", 2, "retest_from_new_angle_after_probe");
  }
  if (
    last &&
    last.kind === "free_response" &&
    (last.purpose === "apply" || last.purpose === "transfer") &&
    last.result === "correct" &&
    !steps.some((s) => s.conceptId === last.conceptId && s.purpose === "defend")
  ) {
    return act(last.conceptId, "free_response", "defend", 2, "devils_advocate_on_correct_answer");
  }

  // --- Interleaved recall: concepts that only lack an unprompted check, after other work.
  const lastIndexOf = (id: string) => steps.map((s) => s.conceptId).lastIndexOf(id);
  const recall = ordered(input.concepts).find((c) => c.needsRecall && c.status !== "demonstrated" && (lastIndexOf(c.id) === -1 || lastIndexOf(c.id) < steps.length - 1));
  if (recall) {
    return act(recall.id, recall.history.lastAssessKind === "free_response" ? "multiple_choice" : "free_response", "recall", 2, "interleaved_unprompted_recall");
  }

  // --- Choose the concept to work on
  const perConcept = (id: string) => steps.filter((s) => s.conceptId === id).length;
  const usable = (c: PlannerConcept) => c.status !== "demonstrated" && !c.needsRecall && perConcept(c.id) < limits.perConcept;
  let target: PlannerConcept | undefined;
  let reason = "";
  const focus = input.focusConceptId ? byId.get(input.focusConceptId) : undefined;
  if (focus && usable(focus)) {
    target = focus;
    reason = "learner_selected_focus";
  }
  if (!target && last && last.kind !== "reflection") {
    const cur = byId.get(last.conceptId);
    if (cur && usable(cur)) {
      target = cur;
      reason = "continue_current_concept";
    }
  }
  if (!target) {
    const prereqsMet = (c: PlannerConcept) =>
      c.prerequisiteIds.every((p) => {
        const pc = byId.get(p);
        return !pc || pc.status !== "not_assessed";
      });
    target = ordered(input.concepts).find((c) => usable(c) && prereqsMet(c));
    reason = "next_concept_prerequisites_met";
    if (!target) {
      target = ordered(input.concepts).find(usable);
      reason = "next_concept_fallback";
    }
  }
  if (!target) {
    if (input.concepts.some((c) => c.needsRecall && c.status !== "demonstrated")) return { action: "complete", reason: "awaiting_recall_next_session" };
    if (steps.some((s) => s.purpose === "transfer")) return { action: "complete", reason: "all_demonstrated" };
    const pick = [...input.concepts].filter((c) => perConcept(c.id) < limits.perConcept).sort((a, b) => a.history.assessments - b.history.assessments)[0];
    if (!pick) return { action: "complete", reason: "all_demonstrated" };
    return act(pick.id, "free_response", "transfer", 3, "transfer_after_demonstration");
  }

  const h = target.history;
  if (h.placedOut && h.assessments === 0) {
    // Placement showed they know it: skip predict/teach and confirm with an application.
    return act(target.id, "free_response", "apply", 2, `${reason}:placed_out_confirm`);
  }
  if (!h.explained && !h.predicted && !h.placedOut) {
    return act(target.id, "multiple_choice", "prediction", 1, `${reason}:predict_before_teaching`);
  }
  if (!h.explained) return act(target.id, "explanation", "teach", 1, `${reason}:worked_explanation`);
  if (h.assessments === 0 || target.status === "not_assessed") return act(target.id, "multiple_choice", "check", 1, `${reason}:first_check`);
  if (h.lastAssessKind === "free_response") return act(target.id, "multiple_choice", "check", 2, `${reason}:varied_check`);
  return act(target.id, "free_response", "apply", 2, `${reason}:apply_explain_back`);
}
