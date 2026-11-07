import type { DisplayStatus, EvidenceResult } from "./mastery";

/**
 * Server-owned next-action policy (no LLM decides DB mutations). Encodes the
 * teaching loop: predict → teach → check → apply, remediate after a miss,
 * prioritise due reviews, respect prerequisites, keep sessions short.
 */

export type ActivityKind = "explanation" | "multiple_choice" | "free_response" | "reflection";
export type Purpose = "prediction" | "teach" | "check" | "apply" | "remediate" | "review" | "transfer" | "reflect";

export type PlannerConcept = {
  id: string;
  title: string;
  position: number;
  prerequisiteIds: string[];
  status: DisplayStatus;
  inPlan: boolean;
  history: { explained: boolean; predicted: boolean; assessments: number; lastAssessKind: ActivityKind | null; reviewActivities: number };
};

export type SessionStep = { conceptId: string; kind: ActivityKind; purpose: Purpose; result: EvidenceResult | null };

export type PlannerInput = {
  sessionKind: "lesson" | "review";
  intent: "curiosity" | "goal";
  concepts: PlannerConcept[];
  sessionSteps: SessionStep[];
  dueReviews: { reviewItemId: string; conceptId: string }[];
  focusConceptId?: string | null;
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

const DEFAULT_LIMITS = { lesson: 6, review: 3, perConcept: 4 };
const ASSESSABLE: ActivityKind[] = ["multiple_choice", "free_response"];

export function chooseNext(input: PlannerInput): PlannerDecision {
  const limits = input.limits ?? DEFAULT_LIMITS;
  const steps = input.sessionSteps;
  const byId = new Map(input.concepts.map((c) => [c.id, c]));

  if (input.sessionKind === "review") {
    const reviewed = new Set(steps.map((s) => s.conceptId));
    const next = input.dueReviews.find((r) => !reviewed.has(r.conceptId) && byId.has(r.conceptId));
    if (steps.length >= limits.review || !next) return { action: "complete", reason: next ? "review_session_limit" : "no_more_due_reviews" };
    const c = byId.get(next.conceptId)!;
    const kind: ActivityKind = c.history.reviewActivities % 2 === 0 ? "multiple_choice" : "free_response";
    return { action: "activity", conceptId: c.id, kind, purpose: "review", difficulty: 2, reviewItemId: next.reviewItemId, reason: "due_review_fresh_variant" };
  }

  // ---- lesson
  const hasReflection = steps.some((s) => s.kind === "reflection");
  if (steps.length >= limits.lesson) return { action: "complete", reason: "lesson_length_reached" };
  if (input.intent === "curiosity" && steps.length === limits.lesson - 1 && !hasReflection && steps.length > 0) {
    return { action: "activity", conceptId: steps.at(-1)!.conceptId, kind: "reflection", purpose: "reflect", difficulty: 1, reason: "curiosity_reflection" };
  }

  // Remediate after a miss: re-teach differently, then retry with a fresh variant.
  const last = steps.at(-1);
  if (last && ASSESSABLE.includes(last.kind) && (last.result === "incorrect" || last.result === "partial") && last.purpose !== "prediction") {
    return { action: "activity", conceptId: last.conceptId, kind: "explanation", purpose: "remediate", difficulty: 1, reason: "misconception_remediation" };
  }
  if (last && last.kind === "explanation" && last.purpose === "remediate") {
    return { action: "activity", conceptId: last.conceptId, kind: "multiple_choice", purpose: "check", difficulty: 2, reason: "retry_after_remediation" };
  }

  const perConcept = (id: string) => steps.filter((s) => s.conceptId === id).length;
  const isShown = (s: DisplayStatus) => s === "demonstrated";
  const usable = (c: PlannerConcept) => !isShown(c.status) && perConcept(c.id) < limits.perConcept;

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
    const ordered = [...input.concepts].sort((a, b) => Number(b.inPlan) - Number(a.inPlan) || a.position - b.position);
    const prereqsMet = (c: PlannerConcept) =>
      c.prerequisiteIds.every((p) => {
        const pc = byId.get(p);
        return !pc || pc.status !== "not_assessed";
      });
    target = ordered.find((c) => usable(c) && prereqsMet(c));
    reason = "next_concept_prerequisites_met";
    if (!target) {
      target = ordered.find(usable);
      reason = "next_concept_fallback";
    }
  }
  if (!target) {
    // Everything demonstrated: offer one transfer question, then finish.
    if (steps.some((s) => s.purpose === "transfer")) return { action: "complete", reason: "all_demonstrated" };
    const pick = [...input.concepts].filter((c) => perConcept(c.id) < limits.perConcept).sort((a, b) => a.history.assessments - b.history.assessments)[0];
    if (!pick) return { action: "complete", reason: "all_demonstrated" };
    return { action: "activity", conceptId: pick.id, kind: "free_response", purpose: "transfer", difficulty: 3, reason: "transfer_after_demonstration" };
  }

  const h = target.history;
  if (!h.explained && !h.predicted) {
    return { action: "activity", conceptId: target.id, kind: "multiple_choice", purpose: "prediction", difficulty: 1, reason: `${reason}:predict_before_teaching` };
  }
  if (!h.explained) {
    return { action: "activity", conceptId: target.id, kind: "explanation", purpose: "teach", difficulty: 1, reason: `${reason}:worked_explanation` };
  }
  if (h.assessments === 0 || target.status === "not_assessed") {
    return { action: "activity", conceptId: target.id, kind: "multiple_choice", purpose: "check", difficulty: 1, reason: `${reason}:first_check` };
  }
  if (h.lastAssessKind === "free_response") {
    return { action: "activity", conceptId: target.id, kind: "multiple_choice", purpose: "check", difficulty: 2, reason: `${reason}:varied_check` };
  }
  return { action: "activity", conceptId: target.id, kind: "free_response", purpose: "apply", difficulty: 2, reason: `${reason}:apply_explain_back` };
}
