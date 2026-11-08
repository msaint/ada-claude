import { randomInt } from "node:crypto";
import { db, json, tx, type Tx } from "@/lib/db/client";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { callModel } from "@/lib/ai";
import { usingMockModel } from "@/lib/env";
import type { ConceptBrief } from "@/lib/ai/model-adapter";
import type { ActivitySpec, EvaluationResult } from "@/lib/schemas/model";
import type { ActivityFeedback, InlineError, LearnerActivity, SessionPhase, SessionSummary, SessionView } from "@/lib/schemas/dto";
import { chooseNext, finalAssessmentConcepts, type PlannedActivity, type SessionKind, type SessionStep } from "@/lib/learning/next-action";
import { computeMastery, type EvidenceRecord } from "@/lib/learning/mastery";
import { initialReview, nextReview } from "@/lib/learning/review-scheduler";
import { loadActiveGoal, loadConceptStates, loadCourse, MIN_CONCEPTS_FOR_PLACEMENT, type ConceptState, type CourseRow } from "./learning-state";
import { track } from "./telemetry";

type SessionRow = {
  id: string;
  course_id: string;
  owner_id: string;
  kind: SessionKind;
  status: "active" | "paused" | "completed";
  current_activity_id: string | null;
  checkpoint_json: { focusConceptId?: string | null; summary?: SessionView["summary"]; pausedAt?: string; difficultyOffset?: number };
  version: number;
};

type Assist = { key: string; text: string };
type ActivityRow = {
  id: string;
  session_id: string;
  course_id: string;
  concept_id: string;
  review_item_id: string | null;
  sequence_no: number;
  kind: ActivitySpec["kind"];
  purpose: string;
  spec_json: ActivitySpec;
  status: "presented" | "evaluating" | "answered" | "completed";
  hints_json: Assist[];
  alt_explanations_json: Assist[];
  model_info_json: Record<string, unknown>;
};

type AttemptRow = {
  id: string;
  activity_id: string;
  owner_id: string;
  submission_json: { choiceId?: string; text?: string; skipped?: boolean };
  hint_count: number;
  explanation_revealed: boolean;
  idempotency_key: string;
  status: "pending_evaluation" | "graded";
  feedback_json: ActivityFeedback | null;
};

export const MAX_HINTS = 3;
/** Purposes whose wrong answers are not revealed: a narrower question (or the course itself) comes next. */
const WITHHOLD_ON_MISS = new Set(["check", "apply", "transfer", "recall", "defend", "placement"]);
/** Sessions where help (hints, alternative explanations, difficulty changes) would distort the measurement. */
const MEASUREMENT_SESSIONS = new Set<SessionKind>(["placement", "assessment"]);
/** Rotating question forms (predict, explain why, find the flaw, apply, connect). */
export const QUESTION_FORMS = [
  "ask the learner to predict an outcome and say why",
  "ask the learner to explain why something happens",
  "present a plausible-but-wrong claim and ask the learner to find the flaw",
  "ask the learner to apply the idea to a new, concrete case",
  "ask the learner to connect this idea to another concept in the course",
];
const FORM_PURPOSES = new Set(["check", "apply", "transfer", "recall", "final", "review"]);
export const MAX_ALT_EXPLANATIONS = 3;

// ---------------------------------------------------------------- loading & DTOs

async function loadSession(t: Tx | ReturnType<typeof db>, ownerId: string, sessionId: string, forUpdate = false): Promise<SessionRow> {
  const rows = forUpdate
    ? await t<SessionRow[]>`select * from sessions where id = ${sessionId} and owner_id = ${ownerId} for update`
    : await t<SessionRow[]>`select * from sessions where id = ${sessionId} and owner_id = ${ownerId}`;
  if (!rows[0]) throw notFound("Session");
  return rows[0];
}

async function loadActivityForOwner(t: Tx, ownerId: string, activityId: string) {
  const [a] = await t<(ActivityRow & { owner_id: string; session_status: SessionRow["status"]; session_kind: SessionKind })[]>`
    select a.*, s.owner_id, s.status as session_status, s.kind as session_kind from activities a join sessions s on s.id = a.session_id
    where a.id = ${activityId} and s.owner_id = ${ownerId} for update of a`;
  if (!a) throw notFound("Activity");
  return a;
}

/** Strips every teacher-only field (answer key, rationale, rubric, ideal answer). */
export function toLearnerActivity(a: Pick<ActivityRow, "id" | "spec_json" | "purpose">, conceptTitle: string): LearnerActivity {
  const s = a.spec_json;
  const base = { id: a.id, purpose: a.purpose, conceptTitle };
  switch (s.kind) {
    case "explanation":
      return { ...base, kind: "explanation", title: s.title, bodyMarkdown: s.bodyMarkdown, continueLabel: s.continueLabel };
    case "multiple_choice":
      return { ...base, kind: "multiple_choice", promptMarkdown: s.promptMarkdown, choices: s.choices.map((c) => ({ id: c.id, text: c.text })), difficulty: s.difficulty };
    case "free_response":
      return { ...base, kind: "free_response", promptMarkdown: s.promptMarkdown, difficulty: s.difficulty };
    default:
      return { ...base, kind: "reflection", promptMarkdown: s.promptMarkdown };
  }
}

function phaseOf(s: SessionRow, a: ActivityRow | null): SessionPhase {
  if (s.status === "completed") return "completed";
  if (s.status === "paused") return "paused";
  if (!a || a.status === "completed") return "choosing_next";
  if (a.status === "presented") return "awaiting_response";
  if (a.status === "evaluating") return "evaluating";
  return "feedback";
}

export async function getSessionView(ownerId: string, sessionId: string, error: InlineError | null = null): Promise<SessionView & { error: InlineError | null }> {
  const s = await loadSession(db(), ownerId, sessionId);
  let activity: ActivityRow | null = null;
  let conceptTitle = "";
  let attempt: AttemptRow | null = null;
  let draft: SessionView["draft"] = null;
  if (s.current_activity_id) {
    const [a] = await db()<(ActivityRow & { concept_title: string })[]>`
      select a.*, c.title as concept_title from activities a join concepts c on c.id = a.concept_id where a.id = ${s.current_activity_id}`;
    activity = a ?? null;
    conceptTitle = a?.concept_title ?? "";
    if (a) {
      [attempt] = await db()<AttemptRow[]>`select * from attempts where activity_id = ${a.id}`;
      const [d] = await db()<{ draft_json: { choiceId?: string; text?: string }; version: number }[]>`
        select draft_json, version from activity_drafts where activity_id = ${a.id} and owner_id = ${ownerId}`;
      draft = d ? { value: d.draft_json, version: d.version } : null;
    }
  }
  const position = activity?.sequence_no ?? 0;
  const feedback: ActivityFeedback | null = attempt
    ? attempt.status === "graded"
      ? attempt.feedback_json
      : {
          status: "pending_evaluation",
          result: null,
          independence: attempt.hint_count > 0 || attempt.explanation_revealed ? "assisted" : "independent",
          feedbackMarkdown: "Your answer is saved. Grading didn't finish — you can retry.",
          submittedText: attempt.submission_json.text,
        }
    : null;
  return {
    id: s.id,
    courseId: s.course_id,
    kind: s.kind,
    status: s.status,
    difficultyOffset: s.checkpoint_json.difficultyOffset ?? 0,
    phase: phaseOf(s, activity),
    position,
    activity: activity && s.status !== "completed" ? toLearnerActivity(activity, conceptTitle) : null,
    draft,
    hints: activity?.hints_json.map((h) => h.text) ?? [],
    altExplanations: activity?.alt_explanations_json.map((h) => h.text) ?? [],
    feedback: s.status === "completed" ? null : feedback,
    summary: s.checkpoint_json.summary ?? null,
    devModel: usingMockModel(),
    aiGenerated: true,
    error,
  };
}

// ---------------------------------------------------------------- session lifecycle

export async function startOrResumeSession(
  ownerId: string,
  courseId: string,
  opts: { kind?: SessionKind; focusConceptId?: string },
): Promise<SessionView & { error: InlineError | null }> {
  const { sessionId, needsActivity } = await tx(async (t) => {
    const course = await loadCourse(t, ownerId, courseId, true);
    if (course.status === "archived") throw conflict("This course is archived.");
    if (opts.focusConceptId) {
      const [c] = await t`select 1 from concepts where id = ${opts.focusConceptId} and course_id = ${courseId}`;
      if (!c) throw notFound("Concept");
    }
    await t`update courses set last_opened_at = now() where id = ${courseId}`;
    const [open] = await t<SessionRow[]>`select * from sessions where course_id = ${courseId} and status in ('active','paused') for update`;
    if (open && (!opts.kind || opts.kind === open.kind)) {
      const checkpoint = opts.focusConceptId ? { ...open.checkpoint_json, focusConceptId: opts.focusConceptId } : open.checkpoint_json;
      await t`update sessions set status = 'active', checkpoint_json = ${json(checkpoint)}, version = version + 1 where id = ${open.id}`;
      if (open.status === "paused") await track(ownerId, "course_resumed", {}, t);
      return { sessionId: open.id, needsActivity: !open.current_activity_id };
    }
    // A different session kind was explicitly requested: close the open one (its records persist).
    if (open) await t`update sessions set status = 'completed', ended_at = now() where id = ${open.id}`;
    const [{ due }] = await t<{ due: number }[]>`
      select count(*)::int as due from review_items where course_id = ${courseId} and status = 'active' and due_at <= now()`;
    if (opts.kind === "review" && due === 0) throw conflict("Nothing is due for review in this course.");
    if (opts.kind === "placement" || opts.kind === "assessment") {
      const concepts = await loadConceptStates(t, courseId);
      const plan = concepts.filter((c) => c.inPlan);
      if (opts.kind === "placement" && plan.length < MIN_CONCEPTS_FOR_PLACEMENT) throw conflict("This course is too small for a placement check.");
      if (opts.kind === "assessment" && (plan.length === 0 || plan.some((c) => c.mastery !== "demonstrated"))) {
        throw conflict("The final check unlocks once every concept in the plan is demonstrated.");
      }
    }
    const kind = opts.kind ?? (due > 0 && !opts.focusConceptId ? "review" : "lesson");
    const [s] = await t<{ id: string }[]>`
      insert into sessions (course_id, owner_id, kind, checkpoint_json) values (${courseId}, ${ownerId}, ${kind}, ${json({ focusConceptId: opts.focusConceptId ?? null })})
      returning id`;
    return { sessionId: s.id, needsActivity: true };
  });
  let error: InlineError | null = null;
  if (needsActivity) {
    try {
      await advanceSession(ownerId, sessionId, null);
    } catch (e) {
      if (!(e instanceof AppError) || !e.retryable) throw e;
      error = { code: e.code, message: e.message, retryable: true };
    }
  }
  return getSessionView(ownerId, sessionId, error);
}

export async function pauseSession(ownerId: string, sessionId: string) {
  await tx(async (t) => {
    const s = await loadSession(t, ownerId, sessionId, true);
    if (s.status === "completed") throw conflict("This session is already complete.");
    await t`update sessions set status = 'paused', checkpoint_json = ${json({ ...s.checkpoint_json, pausedAt: new Date().toISOString() })}, version = version + 1 where id = ${s.id}`;
  });
  return getSessionView(ownerId, sessionId);
}

/**
 * Server-owned transition: completes the current activity (only once it has
 * feedback, or is an explanation) and either generates the next validated
 * activity or completes the session. A stale `fromActivityId` is a no-op that
 * returns the current state, so double clicks never create two activities.
 */
export async function advanceSession(ownerId: string, sessionId: string, fromActivityId: string | null) {
  await tx(async (t) => {
    const s = await loadSession(t, ownerId, sessionId, true);
    if (s.status === "completed") return;
    if ((s.current_activity_id ?? null) !== fromActivityId) return; // stale request
    if (s.status === "paused") await t`update sessions set status = 'active' where id = ${s.id}`;
    if (s.current_activity_id) {
      const [a] = await t<ActivityRow[]>`select * from activities where id = ${s.current_activity_id} for update`;
      if (a.status === "presented" && a.kind !== "explanation") throw conflict("Answer or skip this activity first.");
      if (a.status === "evaluating") throw conflict("This answer is still being graded.");
      if (a.status !== "completed") await t`update activities set status = 'completed' where id = ${a.id}`;
    }
    const course = await loadCourse(t, ownerId, s.course_id);
    const concepts = await loadConceptStates(t, course.id);
    const stepsRows = await t<{ concept_id: string; kind: SessionStep["kind"]; purpose: SessionStep["purpose"]; result: SessionStep["result"] }[]>`
      select a.concept_id, a.kind, a.purpose, e.result
      from activities a left join attempts at on at.activity_id = a.id left join assessment_evidence e on e.attempt_id = at.id
      where a.session_id = ${s.id} order by a.sequence_no`;
    const now = new Date();
    const dueReviews = concepts
      .filter((c) => c.reviewItemId && c.reviewDueAt && c.reviewDueAt <= now)
      .sort((a, b) => a.reviewDueAt!.getTime() - b.reviewDueAt!.getTime())
      .map((c) => ({ reviewItemId: c.reviewItemId!, conceptId: c.id }));
    const decision = chooseNext({
      sessionKind: s.kind,
      intent: course.intent,
      concepts: concepts.map((c) => ({ ...c, status: c.mastery })), // reviews are planned via dueReviews
      sessionSteps: stepsRows.map((r) => ({ conceptId: r.concept_id, kind: r.kind, purpose: r.purpose, result: r.result })),
      dueReviews,
      focusConceptId: s.checkpoint_json.focusConceptId ?? null,
      difficultyOffset: s.checkpoint_json.difficultyOffset ?? 0,
    });
    if (decision.action === "complete") {
      const titleOf = (id: string) => concepts.find((c) => c.id === id)?.title ?? "";
      const summary: SessionSummary = {
        reason: decision.reason,
        assessed: stepsRows.filter((r) => r.result && r.result !== "exposure").length,
        correct: stepsRows.filter((r) => r.result === "correct").length,
        conceptsTouched: [...new Set(stepsRows.map((r) => titleOf(r.concept_id)).filter(Boolean))],
      };
      if (s.kind === "placement") {
        summary.placement = stepsRows.map((r) => ({
          conceptId: r.concept_id,
          title: titleOf(r.concept_id),
          result: r.result === "correct" || r.result === "partial" || r.result === "incorrect" ? r.result : "unknown",
        }));
        // Suggest the first plan concept the learner didn't clearly show (by course order).
        const strong = new Set(stepsRows.filter((r) => r.result === "correct").map((r) => r.concept_id));
        const firstGap = concepts.filter((c) => c.inPlan).sort((a, b) => a.position - b.position).find((c) => !strong.has(c.id));
        summary.suggestedConceptId = firstGap?.id ?? null;
      }
      if (s.kind === "assessment") {
        const finals = stepsRows.filter((r) => r.purpose === "final");
        const integrative = stepsRows.find((r) => r.purpose === "integrative");
        const missed = [...new Set(finals.filter((r) => r.result !== "correct").map((r) => titleOf(r.concept_id)))];
        const passed = finals.length > 0 && missed.length === 0 && !!integrative && (integrative.result === "correct" || integrative.result === "partial");
        if (integrative && !(integrative.result === "correct" || integrative.result === "partial")) missed.push("Putting it together");
        summary.assessment = { passed, missed };
        await t`insert into course_events (course_id, event_type, payload_json) values (${course.id}, 'final_assessment', ${json({ sessionId: s.id, passed, missed })})`;
      }
      await t`update sessions set status = 'completed', ended_at = now(), checkpoint_json = ${json({ ...s.checkpoint_json, summary })}, version = version + 1 where id = ${s.id}`;
      await t`insert into course_events (course_id, event_type, payload_json) values (${course.id}, 'session_completed', ${json({ sessionId: s.id, ...summary, conceptsTouched: summary.conceptsTouched.length })})`;
      await track(ownerId, "session_completed", { kind: s.kind, activities: stepsRows.length }, t);
      return;
    }
    const activityId = await generateActivity(t, ownerId, course, concepts, s, decision, stepsRows.length + 1);
    await t`update sessions set current_activity_id = ${activityId}, version = version + 1 where id = ${s.id}`;
    if (stepsRows.length === 0) await track(ownerId, "first_activity_rendered", { kind: decision.kind }, t);
  });
  return getSessionView(ownerId, sessionId);
}

function brief(c: ConceptState, all: ConceptState[]): ConceptBrief {
  return {
    slug: c.slug,
    title: c.title,
    description: c.description,
    assessmentCriteria: c.criteria,
    prerequisites: c.prerequisiteIds.map((id) => all.find((x) => x.id === id)?.title ?? "").filter(Boolean),
  };
}

async function generateActivity(t: Tx, ownerId: string, course: CourseRow, concepts: ConceptState[], s: SessionRow, d: PlannedActivity, seq: number) {
  const concept = concepts.find((c) => c.id === d.conceptId)!;
  const goal = await loadActiveGoal(t, course);
  const recent = await t<{ result: string; reason: string }[]>`
    select result, reason from assessment_evidence where concept_id = ${concept.id} and result <> 'exposure' order by created_at desc limit 5`;
  const misconceptions = await t<{ m: string }[]>`
    select at.feedback_json->>'misconception' as m from attempts at join activities a on a.id = at.activity_id
    where a.concept_id = ${concept.id} and at.feedback_json->>'misconception' is not null order by at.submitted_at desc limit 3`;
  const prior = await t<{ p: string }[]>`
    select coalesce(spec_json->>'promptMarkdown', spec_json->>'title', '') as p from activities
    where concept_id = ${concept.id} order by created_at desc limit 6`;
  const followUp = d.purpose === "probe" || d.purpose === "defend" ? await previousAnswer(t, s.id, concept.id, d.purpose === "probe") : null;
  const courseConcepts = d.purpose === "integrative" ? finalAssessmentConcepts(concepts.map((c) => ({ ...c, status: c.mastery }))).map((c) => c.title) : undefined;
  const questionForm = FORM_PURPOSES.has(d.purpose) ? QUESTION_FORMS[(seq + concept.position) % QUESTION_FORMS.length] : null;
  const { value, info } = await callModel(ownerId, "activity", (m) =>
    m.generateActivity({
      topic: course.topic,
      intent: course.intent,
      goalText: goal.goal_text,
      baseline: goal.baseline_json?.text ?? "",
      timeBudgetMinutesWeekly: goal.time_budget_minutes_weekly,
      concept: brief(concept, concepts),
      kind: d.kind,
      purpose: d.purpose,
      difficulty: d.difficulty,
      recentEvidence: recent,
      misconceptions: misconceptions.map((r) => r.m),
      priorPrompts: prior.map((r) => r.p.slice(0, 300)).filter(Boolean),
      assistanceUsed: 0,
      linkContext: goal.baseline_json?.link_context ?? null,
      questionForm,
      followUp,
      courseConcepts,
      difficultyPreference: s.checkpoint_json.difficultyOffset ?? 0,
    }),
  );
  if (value.kind !== d.kind) throw new AppError("model_invalid_output", "Generated activity had the wrong type.", true);
  let spec: ActivitySpec = { ...value, version: 1, conceptId: concept.id } as ActivitySpec;
  if (spec.kind === "multiple_choice") spec = shuffleChoices(spec);
  if ("difficulty" in spec) spec = { ...spec, difficulty: d.difficulty } as ActivitySpec;
  const [row] = await t<{ id: string }[]>`
    insert into activities (session_id, course_id, concept_id, review_item_id, sequence_no, kind, purpose, spec_json, model_info_json)
    values (${s.id}, ${course.id}, ${concept.id}, ${d.reviewItemId ?? null}, ${seq}, ${spec.kind}, ${d.purpose}, ${json(spec)}, ${json({ ...info, plannerReason: d.reason })})
    returning id`;
  return row.id;
}

/** The learner's most recent answer on a concept in this session (for Socratic probes and devil's-advocate follow-ups). */
async function previousAnswer(t: Tx, sessionId: string, conceptId: string, includeKey: boolean) {
  const [r] = await t<{ spec_json: ActivitySpec; submission_json: AttemptRow["submission_json"]; feedback_json: (ActivityFeedback & { misconception?: string | null }) | null }[]>`
    select a.spec_json, at.submission_json, at.feedback_json from activities a join attempts at on at.activity_id = a.id
    where a.session_id = ${sessionId} and a.concept_id = ${conceptId} and a.kind in ('multiple_choice','free_response')
    order by a.sequence_no desc limit 1`;
  if (!r) return null;
  const spec = r.spec_json;
  const learnerAnswer =
    spec.kind === "multiple_choice"
      ? (spec.choices.find((c) => c.id === r.submission_json.choiceId)?.text ?? "(no choice)")
      : (r.submission_json.text ?? "(no answer)");
  const answerKey = !includeKey ? null : spec.kind === "multiple_choice" ? (spec.choices.find((c) => c.id === spec.correctChoiceId)?.text ?? null) : spec.kind === "free_response" ? spec.idealAnswerPrivate : null;
  return { promptMarkdown: promptOf(spec).slice(0, 1500), learnerAnswer: learnerAnswer.slice(0, 2000), answerKey, misconception: r.feedback_json?.misconception ?? null };
}

/** Shuffles choices once at generation (persisted, so a reload shows the same order) and relabels ids a–e. */
export function shuffleChoices(spec: Extract<ActivitySpec, { kind: "multiple_choice" }>, rand: (n: number) => number = (n) => randomInt(n)) {
  const choices = [...spec.choices];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  const ids = ["a", "b", "c", "d", "e"];
  const relabeled = choices.map((c, i) => ({ id: ids[i], text: c.text, _orig: c.id }));
  const correct = relabeled.find((c) => c._orig === spec.correctChoiceId)!.id;
  return { ...spec, choices: relabeled.map(({ id, text }) => ({ id, text })), correctChoiceId: correct };
}

// ---------------------------------------------------------------- drafts, hints, explanations

export async function saveActivityDraft(ownerId: string, activityId: string, draft: { choiceId?: string; text?: string }, baseVersion: number) {
  return tx(async (t) => {
    const a = await loadActivityForOwner(t, ownerId, activityId);
    if (a.status !== "presented") throw conflict("This activity has already been answered.");
    const [d] = await t<{ version: number; draft_json: unknown }[]>`select version, draft_json from activity_drafts where activity_id = ${activityId} for update`;
    if (d && d.version !== baseVersion) throw conflict("This answer was changed in another tab.", { draft: { value: d.draft_json, version: d.version } });
    const [r] = await t<{ version: number }[]>`
      insert into activity_drafts (activity_id, owner_id, draft_json, version) values (${activityId}, ${ownerId}, ${json(draft)}, 1)
      on conflict (activity_id) do update set draft_json = excluded.draft_json, version = activity_drafts.version + 1, updated_at = now()
      returning version`;
    return { version: r.version };
  });
}

async function conceptFor(t: Tx, a: ActivityRow) {
  const [c] = await t<{ slug: string; title: string; description: string; assessment_criteria_json: string[]; topic: string; baseline: string | null }[]>`
    select c.slug, c.title, c.description, c.assessment_criteria_json, co.topic, g.baseline_json->>'text' as baseline
    from concepts c join courses co on co.id = c.course_id
    left join course_goal_versions g on g.id = co.active_goal_version_id
    where c.id = ${a.concept_id}`;
  const b: ConceptBrief = { slug: c.slug, title: c.title, description: c.description, assessmentCriteria: c.assessment_criteria_json, prerequisites: [] };
  return { brief: b, topic: c.topic, baseline: c.baseline ?? "" };
}

const promptOf = (s: ActivitySpec) => ("promptMarkdown" in s ? s.promptMarkdown : s.bodyMarkdown);

export async function requestHint(ownerId: string, activityId: string, key: string) {
  return tx(async (t) => {
    const a = await loadActivityForOwner(t, ownerId, activityId);
    if (a.hints_json.some((h) => h.key === key)) return { hints: a.hints_json.map((h) => h.text) };
    if (a.status !== "presented" || a.session_status === "completed") throw conflict("Hints are available before you answer.");
    if (MEASUREMENT_SESSIONS.has(a.session_kind)) throw conflict("Hints aren't available during placement or the final check.");
    if (a.kind !== "multiple_choice" && a.kind !== "free_response") throw invalid("Hints are only available for questions.");
    if (a.hints_json.length >= MAX_HINTS) throw conflict("No more hints for this question — try your best answer.");
    const c = await conceptFor(t, a);
    const s = a.spec_json;
    const answerKey = s.kind === "multiple_choice" ? s.choices.find((x) => x.id === s.correctChoiceId)!.text : s.kind === "free_response" ? s.idealAnswerPrivate : "";
    const { value } = await callModel(ownerId, "hint", (m) =>
      m.hint({ topic: c.topic, concept: c.brief, promptMarkdown: promptOf(s), previousHints: a.hints_json.map((h) => h.text), answerKey }),
    );
    const hints = [...a.hints_json, { key, text: value.hintMarkdown }];
    await t`update activities set hints_json = ${json(hints)} where id = ${a.id}`;
    return { hints: hints.map((h) => h.text) };
  });
}

export async function requestExplanation(ownerId: string, activityId: string, key: string) {
  return tx(async (t) => {
    const a = await loadActivityForOwner(t, ownerId, activityId);
    if (a.alt_explanations_json.some((h) => h.key === key)) return { altExplanations: a.alt_explanations_json.map((h) => h.text) };
    if (a.session_status === "completed") throw conflict("This session is complete.");
    if (MEASUREMENT_SESSIONS.has(a.session_kind)) throw conflict("Explanations aren't available during placement or the final check.");
    if (a.alt_explanations_json.length >= MAX_ALT_EXPLANATIONS) throw conflict("That's all the alternative explanations for now.");
    const c = await conceptFor(t, a);
    const { value } = await callModel(ownerId, "explain", (m) =>
      m.explainDifferently({
        topic: c.topic,
        concept: c.brief,
        activityPrompt: promptOf(a.spec_json),
        previousExplanations: [a.kind === "explanation" ? promptOf(a.spec_json) : "", ...a.alt_explanations_json.map((h) => h.text)].filter(Boolean).map((x) => x.slice(0, 1500)),
        learnerBaseline: c.baseline,
      }),
    );
    const alts = [...a.alt_explanations_json, { key, text: value.bodyMarkdown }];
    await t`update activities set alt_explanations_json = ${json(alts)} where id = ${a.id}`;
    return { altExplanations: alts.map((h) => h.text) };
  });
}

// ---------------------------------------------------------------- attempts, evidence, mastery, reviews

export type Submission = { choiceId: string } | { text: string } | { skipped: true };

/**
 * Submits an answer exactly once. Multiple choice is graded deterministically
 * on the server; free response is persisted first (never lost), then graded
 * by the model against the rubric. Evidence + mastery + review scheduling are
 * written atomically with the graded attempt.
 */
export async function submitAttempt(ownerId: string, activityId: string, key: string, response: Submission) {
  const phase1 = await tx(async (t) => {
    const a = await loadActivityForOwner(t, ownerId, activityId);
    const [byKey] = await t<AttemptRow[]>`select * from attempts where owner_id = ${ownerId} and idempotency_key = ${key}`;
    if (byKey && byKey.activity_id !== activityId) throw conflict("Idempotency key reused for a different activity.");
    const [existing] = await t<AttemptRow[]>`select * from attempts where activity_id = ${activityId}`;
    if (existing) return { sessionId: a.session_id, attempt: existing, activity: a };
    if (a.session_status === "completed") throw conflict("This session is complete.");
    if (a.kind === "explanation") throw invalid("There's nothing to submit for an explanation.");
    const spec = a.spec_json;
    const skipped = "skipped" in response;
    if (!skipped) {
      if (spec.kind === "multiple_choice" && !("choiceId" in response && spec.choices.some((c) => c.id === response.choiceId))) throw invalid("Choose one of the options.");
      if ((spec.kind === "free_response" || spec.kind === "reflection") && !("text" in response)) throw invalid("Write an answer first.");
    }
    const hintCount = a.hints_json.length;
    const revealed = a.alt_explanations_json.length > 0;
    const independence = skipped || hintCount > 0 || revealed ? "assisted" : "independent";
    const needsModel = spec.kind === "free_response" && !skipped;
    const [attempt] = await t<AttemptRow[]>`
      insert into attempts (activity_id, owner_id, submission_json, hint_count, explanation_revealed, idempotency_key, status)
      values (${activityId}, ${ownerId}, ${json(response)}, ${hintCount}, ${revealed}, ${key}, ${needsModel ? "pending_evaluation" : "graded"})
      returning *`;
    await t`delete from activity_drafts where activity_id = ${activityId}`;
    if (needsModel) {
      await t`update activities set status = 'evaluating' where id = ${activityId}`;
      return { sessionId: a.session_id, attempt, activity: a };
    }
    let feedback: ActivityFeedback;
    let result: EvidenceRecord["result"];
    let rubric: unknown = {};
    if (skipped) {
      result = "exposure";
      feedback = {
        status: "graded",
        result: "exposure",
        independence: "assisted",
        skipped: true,
        ...(a.session_kind === "placement"
          ? { feedbackMarkdown: "No problem — that tells Ada where to start. You'll learn this in the course." }
          : {
              feedbackMarkdown: "Here's the answer. This counts as seeing it, not as independent evidence.",
              ...(spec.kind === "multiple_choice" ? { correctChoiceId: spec.correctChoiceId, rationale: spec.rationale } : {}),
              ...(spec.kind === "free_response" ? { exampleAnswer: spec.idealAnswerPrivate } : {}),
            }),
      };
    } else if (spec.kind === "multiple_choice") {
      const choiceId = (response as { choiceId: string }).choiceId;
      result = choiceId === spec.correctChoiceId ? "correct" : "incorrect";
      rubric = { type: "exact_choice", correctChoiceId: spec.correctChoiceId };
      const withhold = result === "incorrect" && shouldWithhold(a);
      feedback = withhold
        ? {
            status: "graded",
            result,
            independence,
            chosenChoiceId: choiceId,
            withheld: true,
            feedbackMarkdown:
              a.session_kind === "placement"
                ? "Not quite — noted. Placement doesn't reveal answers; you'll work through this in the course."
                : "Not quite. Instead of handing you the answer, Ada will ask a narrower question next.",
          }
        : {
            status: "graded",
            result,
            independence,
            chosenChoiceId: choiceId,
            correctChoiceId: spec.correctChoiceId,
            rationale: spec.rationale,
            feedbackMarkdown:
              result === "correct"
                ? independence === "assisted"
                  ? "Right — with help, so this counts as assisted practice."
                  : "That's right."
                : a.purpose === "prediction"
                  ? "Not quite — that's fine for a prediction. Here's why:"
                  : "Not quite. Here's why:",
          };
    } else {
      result = "exposure"; // reflection: noted, never scored
      feedback = { status: "graded", result: "exposure", independence, submittedText: (response as { text: string }).text, feedbackMarkdown: "Thanks — noted. Questions like this help Ada suggest where to explore next." };
    }
    await recordEvidence(t, ownerId, a, attempt, {
      result,
      score: result === "correct" ? 1 : result === "incorrect" ? 0 : null,
      independence,
      rubric,
      reason: skipped ? "skipped" : spec.kind === "reflection" ? "reflection (not scored)" : `choice ${"choiceId" in response ? response.choiceId : ""}`,
      evaluator: { type: skipped || spec.kind !== "multiple_choice" ? "none" : "deterministic", version: 1 },
      feedback,
    });
    return { sessionId: a.session_id, attempt: { ...attempt, status: "graded" as const, feedback_json: feedback }, activity: a };
  });

  let error: InlineError | null = null;
  if (phase1.attempt.status === "pending_evaluation") {
    try {
      await evaluatePending(ownerId, phase1.activity, phase1.attempt);
    } catch (e) {
      if (!(e instanceof AppError) || !(e.retryable || e.code === "rate_limited")) throw e;
      error = { code: e.code, message: "Your answer is saved, but grading didn't finish. Retry to grade it.", retryable: true };
      await track(ownerId, "model_error", { op: "evaluate", code: e.code });
    }
  }
  return getSessionView(ownerId, phase1.sessionId, error);
}

async function evaluatePending(ownerId: string, activity: ActivityRow, attempt: AttemptRow) {
  const spec = activity.spec_json;
  if (spec.kind !== "free_response") return;
  const [c] = await db()<{ slug: string; title: string; description: string; assessment_criteria_json: string[]; topic: string }[]>`
    select c.slug, c.title, c.description, c.assessment_criteria_json, co.topic from concepts c join courses co on co.id = c.course_id where c.id = ${activity.concept_id}`;
  const { value, info } = await callModel(ownerId, "evaluate", (m) =>
    m.evaluateAnswer({
      topic: c.topic,
      concept: { slug: c.slug, title: c.title, description: c.description, assessmentCriteria: c.assessment_criteria_json, prerequisites: [] },
      promptMarkdown: spec.promptMarkdown,
      rubric: spec.rubric,
      idealAnswer: spec.idealAnswerPrivate,
      response: attempt.submission_json.text ?? "",
      withholdAnswer: shouldWithhold(activity as ActivityRow & { session_kind: SessionKind }),
    }),
  );
  await tx(async (t) => {
    const [cur] = await t<AttemptRow[]>`select * from attempts where id = ${attempt.id} for update`;
    if (cur.status !== "pending_evaluation") return; // graded concurrently
    const independence = cur.hint_count > 0 || cur.explanation_revealed ? "assisted" : "independent";
    const withhold = value.result !== "correct" && shouldWithhold(activity as ActivityRow & { session_kind: SessionKind });
    const feedback = freeResponseFeedback(value, independence, spec.idealAnswerPrivate, cur.submission_json.text ?? "", withhold);
    await recordEvidence(t, ownerId, activity, cur, {
      result: value.result,
      score: value.score,
      independence,
      rubric: { rubric: spec.rubric, criteria: value.criteria, rubricVersion: 1 },
      reason: value.misconception ?? value.criteria.map((x) => `${x.criterion}: ${x.met}`).join("; ").slice(0, 500),
      evaluator: { type: "model_rubric", provider: info.provider, model: info.model, rubricVersion: 1 },
      feedback,
      misconception: value.misconception,
    });
  });
}

/** Socratic: lesson misses and placement probes don't reveal the answer (reviews and the final check do). */
function shouldWithhold(a: { purpose: string; session_kind: SessionKind }) {
  return WITHHOLD_ON_MISS.has(a.purpose) && (a.session_kind === "lesson" || a.session_kind === "placement");
}

function freeResponseFeedback(v: EvaluationResult, independence: "independent" | "assisted", ideal: string, submitted: string, withhold = false): ActivityFeedback {
  const note =
    v.result === "uncertain"
      ? "\n\n_Ada isn't confident grading this one, so it won't count either way._"
      : v.result === "correct" && independence === "assisted"
        ? "\n\n_You used help on this one, so it counts as assisted practice._"
        : "";
  if (withhold) return { status: "graded", result: v.result, independence, feedbackMarkdown: v.feedbackMarkdown + note, criteria: v.criteria, submittedText: submitted, withheld: true };
  return { status: "graded", result: v.result, independence, feedbackMarkdown: v.feedbackMarkdown + note, criteria: v.criteria, exampleAnswer: ideal, submittedText: submitted };
}

async function recordEvidence(
  t: Tx,
  ownerId: string,
  a: ActivityRow,
  attempt: AttemptRow,
  e: {
    result: EvidenceRecord["result"];
    score: number | null;
    independence: "independent" | "assisted";
    rubric: unknown;
    reason: string;
    evaluator: Record<string, unknown>;
    feedback: ActivityFeedback;
    misconception?: string | null;
  },
) {
  const difficulty = "difficulty" in a.spec_json ? a.spec_json.difficulty : null;
  const feedbackJson = e.misconception ? { ...e.feedback, misconception: e.misconception } : e.feedback;
  await t`update attempts set status = 'graded', feedback_json = ${json(feedbackJson)} where id = ${attempt.id}`;
  await t`update activities set status = 'answered' where id = ${a.id}`;
  // "Prompted" = answered right after another activity on the same concept in this session.
  const [prev] = await t<{ concept_id: string }[]>`select concept_id from activities where session_id = ${a.session_id} and sequence_no = ${a.sequence_no - 1}`;
  const recall = prev && prev.concept_id === a.concept_id ? "prompted" : "unprompted";
  await t`insert into assessment_evidence (attempt_id, course_id, concept_id, activity_kind, purpose, result, score, independence, difficulty, rubric_json, reason, evaluator_json, recall)
    values (${attempt.id}, ${a.course_id}, ${a.concept_id}, ${a.kind}, ${a.purpose}, ${e.result}, ${e.score}, ${e.independence}, ${difficulty}, ${json(e.rubric)}, ${e.reason}, ${json(e.evaluator)}, ${recall})`;
  await recomputeMastery(t, a.course_id, a.concept_id);
  if (e.result !== "exposure") await scheduleReview(t, ownerId, a, e.result, e.independence);
  await track(ownerId, "attempt_submitted", { kind: a.kind, result: e.result, independence: e.independence }, t);
}

export async function recomputeMastery(t: Tx, courseId: string, conceptId: string) {
  const rows = await t<{ activity_id: string; result: EvidenceRecord["result"]; independence: EvidenceRecord["independence"]; difficulty: number | null; purpose: string; recall: "prompted" | "unprompted"; created_at: Date }[]>`
    select at.activity_id, e.result, e.independence, e.difficulty, e.purpose, e.recall, e.created_at
    from assessment_evidence e join attempts at on at.id = e.attempt_id where e.concept_id = ${conceptId} order by e.created_at`;
  const m = computeMastery(rows.map((r) => ({ activityId: r.activity_id, result: r.result, independence: r.independence, difficulty: r.difficulty, purpose: r.purpose, recall: r.recall, createdAt: r.created_at })));
  await t`insert into mastery_estimates (course_id, concept_id, status, confidence, last_independent_success_at, last_assessed_at, details_json, updated_at)
    values (${courseId}, ${conceptId}, ${m.status}, ${m.confidence}, ${m.lastIndependentSuccessAt}, ${m.lastAssessedAt}, ${json(m.details)}, now())
    on conflict (course_id, concept_id) do update set status = excluded.status, confidence = excluded.confidence,
      last_independent_success_at = excluded.last_independent_success_at, last_assessed_at = excluded.last_assessed_at,
      details_json = excluded.details_json, updated_at = now()`;
  return m;
}

async function scheduleReview(t: Tx, ownerId: string, a: ActivityRow, result: Exclude<EvidenceRecord["result"], "exposure">, independence: "independent" | "assisted") {
  const now = new Date();
  if (a.review_item_id) {
    const [r] = await t<{ id: string; interval_days: number; repetitions: number; status: string }[]>`select * from review_items where id = ${a.review_item_id} for update`;
    if (r && r.status === "active") {
      const next = nextReview({ intervalDays: r.interval_days, repetitions: r.repetitions }, { result, independence }, now);
      await t`update review_items set interval_days = ${next.intervalDays}, repetitions = ${next.repetitions}, due_at = ${next.dueAt}, last_review_at = ${now} where id = ${r.id}`;
      await track(ownerId, "review_completed", { result }, t);
    }
    return;
  }
  const [existing] = await t`select id from review_items where concept_id = ${a.concept_id} and status = 'active'`;
  if (existing) return;
  const init = initialReview(now);
  await t`insert into review_items (course_id, concept_id, owner_id, due_at, interval_days, repetitions)
    values (${a.course_id}, ${a.concept_id}, ${ownerId}, ${init.dueAt}, ${init.intervalDays}, ${init.repetitions}) on conflict do nothing`;
}

// ---------------------------------------------------------------- learner controls

/** "Show me the answer" for a withheld (Socratic) miss. Evidence is unchanged; it was already a miss. */
export async function revealAnswer(ownerId: string, activityId: string) {
  const sessionId = await tx(async (t) => {
    const a = await loadActivityForOwner(t, ownerId, activityId);
    const [at] = await t<AttemptRow[]>`select * from attempts where activity_id = ${activityId} for update`;
    if (!at || at.status !== "graded" || !at.feedback_json) throw conflict("Answer the question first.");
    if (!at.feedback_json.withheld) return a.session_id; // already visible (idempotent)
    const spec = a.spec_json;
    const feedback: ActivityFeedback = {
      ...at.feedback_json,
      withheld: false,
      revealed: true,
      ...(spec.kind === "multiple_choice" ? { correctChoiceId: spec.correctChoiceId, rationale: spec.rationale } : {}),
      ...(spec.kind === "free_response" ? { exampleAnswer: spec.idealAnswerPrivate } : {}),
    };
    await t`update attempts set feedback_json = ${json(feedback)}, explanation_revealed = true where id = ${at.id}`;
    return a.session_id;
  });
  return getSessionView(ownerId, sessionId);
}

/** "Harder" / "Easier": shifts difficulty for the rest of this lesson (applies from the next question). */
export async function setDifficulty(ownerId: string, sessionId: string, offset: -1 | 0 | 1) {
  await tx(async (t) => {
    const s = await loadSession(t, ownerId, sessionId, true);
    if (s.status === "completed") throw conflict("This session is complete.");
    if (s.kind !== "lesson") throw conflict("Difficulty can be changed during lessons.");
    await t`update sessions set checkpoint_json = ${json({ ...s.checkpoint_json, difficultyOffset: offset })}, version = version + 1 where id = ${s.id}`;
  });
  return getSessionView(ownerId, sessionId);
}
