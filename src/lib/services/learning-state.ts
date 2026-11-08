import type { Db } from "@/lib/db/client";
import { notFound } from "@/lib/errors";
import { displayStatus, type DisplayStatus, type MasteryStatus } from "@/lib/learning/mastery";
import type { ActivityKind, PlannerConcept } from "@/lib/learning/next-action";
import type { NextAction } from "@/lib/schemas/dto";

export type CourseRow = {
  id: string;
  owner_id: string;
  title: string;
  topic: string;
  intent: "curiosity" | "goal";
  status: "active" | "paused" | "archived";
  active_goal_version_id: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  last_opened_at: Date;
};

export type GoalRow = {
  id: string;
  version: number;
  intent: "curiosity" | "goal";
  goal_text: string;
  success_criteria_json: string[];
  time_budget_minutes_weekly: number | null;
  baseline_json: { text?: string; assumptions?: string[]; link_context?: string | null };
  depth: string | null;
  reason: string | null;
  created_at: Date;
};

export type ConceptState = {
  id: string;
  slug: string;
  title: string;
  description: string;
  criteria: string[];
  importance: number;
  position: number;
  origin: "initial" | "branch" | "revision";
  prerequisiteIds: string[];
  mastery: MasteryStatus;
  masteryReason: string;
  reviewDueAt: Date | null;
  reviewItemId: string | null;
  display: DisplayStatus;
  inPlan: boolean;
  evidenceCount: number;
  needsRecall: boolean;
  history: PlannerConcept["history"];
};

/** Ownership-checked course load. Foreign or deleted IDs are indistinguishable (404). */
export async function loadCourse(t: Db, ownerId: string, courseId: string, forUpdate = false): Promise<CourseRow> {
  const rows = forUpdate
    ? await t<CourseRow[]>`select * from courses where id = ${courseId} and owner_id = ${ownerId} for update`
    : await t<CourseRow[]>`select * from courses where id = ${courseId} and owner_id = ${ownerId}`;
  if (!rows[0]) throw notFound("Course");
  return rows[0];
}

export async function loadActiveGoal(t: Db, course: CourseRow): Promise<GoalRow> {
  const [g] = await t<GoalRow[]>`
    select * from course_goal_versions where course_id = ${course.id}
    order by (id = ${course.active_goal_version_id}) desc, version desc limit 1`;
  return g;
}

export async function loadPlan(t: Db, courseId: string) {
  const [p] = await t<{ version: number; plan_json: { required_slugs?: string[]; direction?: string; explanation?: string }; reason: string }[]>`
    select version, plan_json, reason from course_curriculum_versions where course_id = ${courseId} order by version desc limit 1`;
  return p ?? { version: 0, plan_json: {}, reason: "" };
}

/** Assembles every concept's derived state from structured records (the source of truth). */
export async function loadConceptStates(t: Db, courseId: string, now = new Date()): Promise<ConceptState[]> {
  const plan = await loadPlan(t, courseId);
  const required = new Set(plan.plan_json.required_slugs ?? []);
  const concepts = await t<
    {
      id: string;
      slug: string;
      title: string;
      description: string;
      assessment_criteria_json: string[];
      importance: number;
      position: number;
      origin: ConceptState["origin"];
      status: MasteryStatus | null;
      details_json: { reason?: string; needsRecall?: boolean } | null;
      due_at: Date | null;
      review_item_id: string | null;
    }[]
  >`
    select c.id, c.slug, c.title, c.description, c.assessment_criteria_json, c.importance, c.position, c.origin,
           m.status, m.details_json, r.due_at, r.id as review_item_id
    from concepts c
    left join mastery_estimates m on m.concept_id = c.id
    left join review_items r on r.concept_id = c.id and r.status = 'active'
    where c.course_id = ${courseId} and c.status = 'active'
    order by c.position`;
  const edges = await t<{ from_concept_id: string; to_concept_id: string }[]>`
    select from_concept_id, to_concept_id from concept_edges where course_id = ${courseId} and edge_type = 'prerequisite'`;
  const hist = await t<{ concept_id: string; explained: boolean; predicted: boolean; review_activities: number }[]>`
    select concept_id,
      bool_or(kind = 'explanation') as explained,
      bool_or(purpose in ('prediction', 'placement')) as predicted,
      count(*) filter (where purpose = 'review')::int as review_activities
    from activities where course_id = ${courseId} group by concept_id`;
  // `taught` excludes pre-teaching predictions and placement probes, so neither replaces the post-teaching check.
  const ev = await t<{ concept_id: string; n: number; taught: number; last_kind: ActivityKind | null; placed_out: boolean }[]>`
    select concept_id, count(*)::int as n,
      count(*) filter (where purpose not in ('prediction', 'placement'))::int as taught,
      coalesce(bool_or(purpose = 'placement' and result = 'correct' and coalesce(difficulty, 1) >= 2), false) as placed_out,
      (array_agg(activity_kind order by created_at desc) filter (where purpose not in ('prediction', 'placement')))[1] as last_kind
    from assessment_evidence where course_id = ${courseId} and result <> 'exposure' group by concept_id`;
  const hmap = new Map(hist.map((h) => [h.concept_id, h]));
  const emap = new Map(ev.map((e) => [e.concept_id, e]));
  return concepts.map((c) => {
    const mastery = c.status ?? "not_assessed";
    const h = hmap.get(c.id);
    const e = emap.get(c.id);
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      criteria: c.assessment_criteria_json,
      importance: c.importance,
      position: c.position,
      origin: c.origin,
      prerequisiteIds: edges.filter((x) => x.to_concept_id === c.id).map((x) => x.from_concept_id),
      mastery,
      masteryReason: c.details_json?.reason ?? "",
      needsRecall: !!c.details_json?.needsRecall && mastery !== "demonstrated",
      reviewDueAt: c.due_at,
      reviewItemId: c.review_item_id,
      display: displayStatus(mastery, c.due_at, now),
      inPlan: required.size === 0 || required.has(c.slug),
      evidenceCount: e?.n ?? 0,
      history: {
        explained: h?.explained ?? false,
        predicted: h?.predicted ?? false,
        assessments: e?.taught ?? 0,
        lastAssessKind: e?.last_kind ?? null,
        placedOut: e?.placed_out ?? false,
        reviewActivities: h?.review_activities ?? 0,
      },
    };
  });
}

export const MIN_CONCEPTS_FOR_PLACEMENT = 3;

/** Whether a final mixed assessment was passed since the current plan (curriculum version) was made. */
export async function loadFinalPassed(t: Db, courseId: string): Promise<boolean> {
  const [r] = await t<{ passed: boolean }[]>`
    select exists (
      select 1 from course_events e
      where e.course_id = ${courseId} and e.event_type = 'final_assessment' and (e.payload_json->>'passed')::boolean
        and e.created_at >= coalesce((select max(created_at) from course_curriculum_versions where course_id = ${courseId}), '-infinity')
    ) as passed`;
  return r?.passed ?? false;
}

const OPEN_LABEL: Record<string, string> = { review: "Continue review", placement: "Continue placement", assessment: "Continue final check", lesson: "Continue lesson" };

export function computeNextAction(
  concepts: ConceptState[],
  intent: "curiosity" | "goal",
  openSession: { kind: string } | null,
  extras: { finalPassed?: boolean } = {},
  now = new Date(),
): NextAction {
  if (openSession) {
    const kind = openSession.kind === "review" ? "review" : openSession.kind === "placement" ? "placement" : openSession.kind === "assessment" ? "assessment" : "learn";
    return { kind, label: OPEN_LABEL[openSession.kind] ?? "Continue lesson" };
  }
  const due = concepts.filter((c) => c.reviewDueAt && c.reviewDueAt <= now && c.mastery !== "not_assessed");
  if (due.length) return { kind: "review", label: due.length === 1 ? `Review: ${due[0].title}` : `Review ${due.length} concepts` };
  const fresh = concepts.every((c) => !c.history.explained && !c.history.predicted && c.evidenceCount === 0 && c.mastery === "not_assessed");
  if (intent === "goal" && fresh && concepts.filter((c) => c.inPlan).length >= MIN_CONCEPTS_FOR_PLACEMENT) {
    return { kind: "placement", label: "Find your starting point" };
  }
  const plan = concepts.filter((c) => c.inPlan);
  if (intent === "goal" && plan.length > 0 && plan.every((c) => c.mastery === "demonstrated") && !extras.finalPassed) {
    return { kind: "assessment", label: "Take the final check" };
  }
  const next = plan.find((c) => c.mastery !== "demonstrated") ?? concepts.find((c) => c.mastery !== "demonstrated");
  if (next) return { kind: "learn", label: `Learn: ${next.title}` };
  return intent === "curiosity" ? { kind: "explore", label: "Explore a new branch" } : { kind: "learn", label: "Practice and stretch" };
}
