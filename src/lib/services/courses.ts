import { db, json, tx } from "@/lib/db/client";
import { AppError, conflict } from "@/lib/errors";
import { callModel } from "@/lib/ai";
import { validateExpansion } from "@/lib/learning/curriculum";
import { estimateReadiness } from "@/lib/learning/readiness";
import { formatInZone } from "@/lib/learning/review-scheduler";
import type { CourseHeader, CourseListItem, CourseProgress, OutlineView } from "@/lib/schemas/dto";
import { insertConcepts } from "./drafts";
import { computeNextAction, loadActiveGoal, loadConceptStates, loadCourse, loadPlan, type ConceptState } from "./learning-state";
import { track } from "./telemetry";

export async function listCourses(ownerId: string): Promise<CourseListItem[]> {
  const rows = await db()<{ id: string; title: string; intent: "curiosity" | "goal"; updated_at: Date; due: number; open_kind: string | null }[]>`
    select c.id, c.title, c.intent, greatest(c.updated_at, c.last_opened_at) as updated_at,
      (select count(*)::int from review_items r where r.course_id = c.id and r.status = 'active' and r.due_at <= now()) as due,
      (select s.kind from sessions s where s.course_id = c.id and s.status in ('active','paused') limit 1) as open_kind
    from courses c where c.owner_id = ${ownerId} and c.status <> 'archived'
    order by c.last_opened_at desc limit 200`;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    intent: r.intent,
    updatedAt: r.updated_at.toISOString(),
    reviewDueCount: r.due,
    hasOpenSession: !!r.open_kind,
    nextActionLabel: r.open_kind ? "Continue" : r.due ? "Review due" : null,
  }));
}

export async function getCourseHeader(ownerId: string, courseId: string, touch = true): Promise<CourseHeader> {
  const course = await loadCourse(db(), ownerId, courseId);
  if (touch) await db()`update courses set last_opened_at = now() where id = ${courseId}`;
  const goal = await loadActiveGoal(db(), course);
  const history = await db()<{ version: number; goal_text: string; reason: string | null; created_at: Date }[]>`
    select version, goal_text, reason, created_at from course_goal_versions where course_id = ${courseId} order by version desc`;
  const [open] = await db()<{ id: string; kind: "lesson" | "review"; status: "active" | "paused" }[]>`
    select id, kind, status from sessions where course_id = ${courseId} and status in ('active','paused') limit 1`;
  const concepts = await loadConceptStates(db(), courseId);
  return {
    id: course.id,
    title: course.title,
    topic: course.topic,
    intent: course.intent,
    status: course.status,
    version: course.version,
    goal: { version: goal.version, text: goal.goal_text, successCriteria: goal.success_criteria_json, timeBudgetMinutesWeekly: goal.time_budget_minutes_weekly, createdAt: goal.created_at.toISOString() },
    goalHistory: history.map((h) => ({ version: h.version, text: h.goal_text, reason: h.reason, createdAt: h.created_at.toISOString() })),
    nextAction: computeNextAction(concepts, course.intent, open ?? null),
    openSession: open ?? null,
    reviewDueCount: concepts.filter((c) => c.display === "review_due").length,
  };
}

export async function patchCourse(ownerId: string, courseId: string, input: { title?: string; status?: "active" | "paused" | "archived"; expectedVersion: number }) {
  return tx(async (t) => {
    const c = await loadCourse(t, ownerId, courseId, true);
    if (c.version !== input.expectedVersion) throw conflict("This course was changed elsewhere. Reload to see the latest.");
    await t`update courses set title = ${input.title ?? c.title}, status = ${input.status ?? c.status}, version = version + 1 where id = ${courseId}`;
    return { id: courseId, version: c.version + 1 };
  });
}

/** Deletes the course; ON DELETE CASCADE removes sessions, activities, attempts, evidence, reviews, events and notifications. */
export async function deleteCourse(ownerId: string, courseId: string) {
  await tx(async (t) => {
    await loadCourse(t, ownerId, courseId, true);
    await t`delete from courses where id = ${courseId} and owner_id = ${ownerId}`;
  });
}

/** Appends a goal version, re-plans relative to the new goal, preserves all evidence. */
export async function reviseGoal(ownerId: string, courseId: string, input: { goalText: string; intent?: "curiosity" | "goal"; reason?: string; timeBudgetMinutesWeekly?: number | null }) {
  const course = await loadCourse(db(), ownerId, courseId);
  const goal = await loadActiveGoal(db(), course);
  const concepts = await loadConceptStates(db(), courseId);
  const intent = input.intent ?? course.intent;
  const { value, info } = await callModel(ownerId, "expand", (m) =>
    m.expandCurriculum({
      mode: "revise",
      topic: course.topic,
      intent,
      goalText: input.goalText,
      previousGoalText: goal.goal_text,
      request: input.reason ?? "Learner changed their goal",
      existing: concepts.map((c) => ({ slug: c.slug, title: c.title, status: c.display })),
      linkContext: goal.baseline_json?.link_context ?? null,
    }),
  );
  const checked = validateExpansion(value, concepts.map((c) => c.slug), "revise");
  if (!checked.ok) throw new AppError("model_invalid_output", "The revised plan wasn't usable. Please retry.", true);
  const exp = checked.value;
  const result = await tx(async (t) => {
    const c = await loadCourse(t, ownerId, courseId, true);
    const [{ v }] = await t<{ v: number }[]>`select coalesce(max(version), 0)::int as v from course_goal_versions where course_id = ${courseId}`;
    const [g] = await t<{ id: string }[]>`
      insert into course_goal_versions (course_id, version, intent, goal_text, success_criteria_json, time_budget_minutes_weekly, baseline_json, depth, reason)
      values (${courseId}, ${v + 1}, ${intent}, ${input.goalText}, ${json(exp.success_criteria)},
              ${input.timeBudgetMinutesWeekly === undefined ? goal.time_budget_minutes_weekly : input.timeBudgetMinutesWeekly},
              ${json(goal.baseline_json)}, ${goal.depth}, ${input.reason ?? "goal revised"})
      returning id`;
    await t`update courses set active_goal_version_id = ${g.id}, intent = ${intent}, version = version + 1 where id = ${courseId}`;
    const existing = new Map(concepts.map((x) => [x.slug, x.id]));
    const [{ maxPos }] = await t<{ maxPos: number }[]>`select coalesce(max(position), 0)::int as "maxPos" from concepts where course_id = ${courseId}`;
    await insertConcepts(t, courseId, exp.new_concepts, maxPos + 1, "revision", existing);
    const plan = await loadPlan(t, courseId);
    await t`insert into course_curriculum_versions (course_id, version, plan_json, reason, model_info_json)
      values (${courseId}, ${plan.version + 1}, ${json({ direction: exp.direction, required_slugs: [...exp.keep_slugs, ...exp.new_concepts.map((n) => n.slug)], explanation: exp.explanation, goal_version: v + 1 })}, 'goal_revised', ${json(info)})`;
    await t`insert into course_events (course_id, event_type, payload_json) values (${courseId}, 'goal_revised', ${json({ from: goal.version, to: v + 1, added: exp.new_concepts.length, kept: exp.keep_slugs.length })})`;
    return { goalVersion: v + 1, explanation: exp.explanation, added: exp.new_concepts.map((n) => n.title), courseVersion: c.version + 1 };
  });
  await track(ownerId, "course_goal_revised", { added: result.added.length });
  return result;
}

/** Follows a curiosity branch inside the same course: extends the graph, never creates a new course or chat. */
export async function addBranch(ownerId: string, courseId: string, question: string) {
  const course = await loadCourse(db(), ownerId, courseId);
  const goal = await loadActiveGoal(db(), course);
  const concepts = await loadConceptStates(db(), courseId);
  const { value, info } = await callModel(ownerId, "expand", (m) =>
    m.expandCurriculum({
      mode: "branch",
      topic: course.topic,
      intent: course.intent,
      goalText: goal.goal_text,
      request: question,
      existing: concepts.map((c) => ({ slug: c.slug, title: c.title, status: c.display })),
      linkContext: goal.baseline_json?.link_context ?? null,
    }),
  );
  const checked = validateExpansion(value, concepts.map((c) => c.slug), "branch");
  if (!checked.ok) throw new AppError("model_invalid_output", "The branch wasn't usable. Please retry.", true);
  const exp = checked.value;
  return tx(async (t) => {
    await loadCourse(t, ownerId, courseId, true);
    const existing = new Map(concepts.map((x) => [x.slug, x.id]));
    const [{ maxPos }] = await t<{ maxPos: number }[]>`select coalesce(max(position), 0)::int as "maxPos" from concepts where course_id = ${courseId}`;
    const ids = await insertConcepts(t, courseId, exp.new_concepts, maxPos + 1, "branch", existing);
    if (exp.anchor_slug) {
      for (const n of exp.new_concepts) {
        if (!n.prerequisites.includes(exp.anchor_slug)) {
          await t`insert into concept_edges (course_id, from_concept_id, to_concept_id, edge_type) values (${courseId}, ${ids.get(exp.anchor_slug)!}, ${ids.get(n.slug)!}, 'related') on conflict do nothing`;
        }
      }
    }
    const plan = await loadPlan(t, courseId);
    const required = [...(plan.plan_json.required_slugs ?? concepts.map((c) => c.slug)), ...exp.new_concepts.map((n) => n.slug)];
    await t`insert into course_curriculum_versions (course_id, version, plan_json, reason, model_info_json)
      values (${courseId}, ${plan.version + 1}, ${json({ ...plan.plan_json, required_slugs: required, explanation: exp.explanation })}, 'branch', ${json(info)})`;
    await t`insert into course_events (course_id, event_type, payload_json) values (${courseId}, 'branch_added', ${json({ added: exp.new_concepts.length })})`;
    const firstId = ids.get(exp.new_concepts[0].slug)!;
    return { conceptIds: exp.new_concepts.map((n) => ids.get(n.slug)!), firstConceptId: firstId, explanation: exp.explanation };
  });
}

function depthOf(c: ConceptState, byId: Map<string, ConceptState>, seen = new Set<string>()): number {
  if (seen.has(c.id) || c.prerequisiteIds.length === 0) return 0;
  seen.add(c.id);
  return 1 + Math.max(...c.prerequisiteIds.map((p) => (byId.get(p) ? depthOf(byId.get(p)!, byId, seen) : -1)));
}

export async function getOutline(ownerId: string, courseId: string): Promise<OutlineView> {
  await loadCourse(db(), ownerId, courseId);
  const concepts = await loadConceptStates(db(), courseId);
  const plan = await loadPlan(db(), courseId);
  const evidence = await db()<{ concept_id: string; result: string; independence: string; activity_kind: string; created_at: Date; reason: string }[]>`
    select concept_id, result, independence, activity_kind, created_at, reason from assessment_evidence
    where course_id = ${courseId} order by created_at desc`;
  const byId = new Map(concepts.map((c) => [c.id, c]));
  return {
    courseId,
    curriculumVersion: plan.version,
    revisionNote: plan.plan_json.explanation ?? null,
    concepts: concepts.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      criteria: c.criteria,
      status: c.display,
      depth: Math.min(3, depthOf(c, byId)),
      prerequisiteTitles: c.prerequisiteIds.map((p) => byId.get(p)?.title ?? "").filter(Boolean),
      origin: c.origin,
      inCurrentPlan: c.inPlan,
      evidence: evidence
        .filter((e) => e.concept_id === c.id)
        .slice(0, 6)
        .map((e) => ({ result: e.result, independence: e.independence, kind: e.activity_kind, at: e.created_at.toISOString(), reason: e.result === "exposure" ? "" : e.reason.slice(0, 200) })),
    })),
  };
}

export async function getProgress(ownerId: string, courseId: string, timezone: string): Promise<CourseProgress> {
  const course = await loadCourse(db(), ownerId, courseId);
  const goal = await loadActiveGoal(db(), course);
  const concepts = await loadConceptStates(db(), courseId);
  const [open] = await db()<{ kind: string }[]>`select kind from sessions where course_id = ${courseId} and status in ('active','paused') limit 1`;
  const [counts] = await db()<{ sessions: number; activities: number }[]>`
    select (select count(*)::int from sessions where course_id = ${courseId}) as sessions,
           (select count(*)::int from activities where course_id = ${courseId}) as activities`;
  const reviews = await db()<{ title: string; due_at: Date }[]>`
    select c.title, r.due_at from review_items r join concepts c on c.id = r.concept_id
    where r.course_id = ${courseId} and r.status = 'active' order by r.due_at limit 10`;
  const now = new Date();
  const progress: CourseProgress = {
    courseId,
    intent: course.intent,
    goalText: goal.goal_text,
    concepts: concepts.map((c) => ({ id: c.id, title: c.title, status: c.display, evidenceCount: c.evidenceCount, reason: c.masteryReason })),
    canDo: concepts.filter((c) => c.mastery === "demonstrated").map((c) => ({ title: c.title, criteria: c.criteria })),
    needsPractice: concepts.filter((c) => c.mastery === "developing").map((c) => ({ title: c.title, reason: c.masteryReason })),
    dueToRevisit: reviews.map((r) => ({ conceptTitle: r.title, dueAt: r.due_at.toISOString(), dueLabel: r.due_at <= now ? "Due now" : formatInZone(r.due_at, timezone) })),
    activity: counts,
    nextAction: computeNextAction(concepts, course.intent, open ?? null),
  };
  if (course.intent === "goal") {
    const required = concepts.filter((c) => c.inPlan);
    progress.readiness = estimateReadiness(
      required.map((c) => ({ slug: c.slug, title: c.title, status: c.display, importance: c.importance, prerequisites: c.prerequisiteIds.map((p) => concepts.find((x) => x.id === p)?.slug ?? ""), evidenceCount: c.evidenceCount })),
    );
  } else {
    const explored = await db()<{ concept_id: string }[]>`select distinct concept_id from activities where course_id = ${courseId}`;
    const exploredSet = new Set(explored.map((e) => e.concept_id));
    const explanations = await db()<{ title: string; created_at: Date }[]>`
      select c.title, e.created_at from assessment_evidence e join concepts c on c.id = e.concept_id
      where e.course_id = ${courseId} and e.activity_kind = 'free_response' and e.result = 'correct' order by e.created_at desc limit 5`;
    const reflections = await db()<{ text: string }[]>`
      select at.submission_json->>'text' as text from attempts at join activities a on a.id = at.activity_id
      where a.course_id = ${courseId} and a.kind = 'reflection' and at.submission_json ? 'text' order by at.submitted_at desc limit 5`;
    progress.curiosity = {
      exploredCount: exploredSet.size,
      branchCount: concepts.filter((c) => c.origin === "branch").length,
      recentExplanations: explanations.map((e) => ({ conceptTitle: e.title, at: formatInZone(e.created_at, timezone) })),
      openQuestions: reflections.map((r) => r.text).filter(Boolean),
      suggestedBranches: concepts.filter((c) => !exploredSet.has(c.id)).slice(0, 4).map((c) => c.title),
    };
  }
  return progress;
}
