import { db, json, tx, type Db, type Tx } from "@/lib/db/client";
import { withClaim } from "@/lib/db/claims";
import { AppError, conflict, notFound } from "@/lib/errors";
import { callModel } from "@/lib/ai";
import { usingMockModel } from "@/lib/env";
import type { FetchedSource, ModelInfo } from "@/lib/ai/model-adapter";
import type { CourseDraftView, DraftTurn, InlineError } from "@/lib/schemas/dto";
import type { CurriculumProposal, DraftField, Interpretation } from "@/lib/schemas/model";
import { validateCurriculum } from "@/lib/learning/curriculum";
import { track } from "./telemetry";

export const MAX_QUESTIONS = 4;

export type DraftAnswer = { field: DraftField; question: string; options: string[]; answer: string; reasonCode: string };
export type DraftState = {
  answers: DraftAnswer[];
  pending: { question: string; options: string[]; field: DraftField; reasonCode: string } | null;
  startNow: boolean;
  interpretation: Interpretation | null;
  adjustment: string | null;
  processedKeys: string[];
  /** Summary of pages the learner linked, written by the model after reading them. */
  linkContext?: string | null;
  /** Pages the provider actually fetched (verified by the API, never model-invented). */
  sources?: FetchedSource[];
};
export type DraftProposal = { curriculum: CurriculumProposal; interpretation: Interpretation; modelInfo: ModelInfo };

type DraftRow = {
  id: string;
  owner_id: string;
  topic: string;
  state_json: DraftState;
  status: "collecting" | "ready" | "converted";
  proposal_json: DraftProposal | null;
  version: number;
  converted_course_id: string | null;
  last_error: InlineError | null;
};

const emptyState = (): DraftState => ({ answers: [], pending: null, startNow: false, interpretation: null, adjustment: null, processedKeys: [] });

function parseError(raw: string | null): InlineError | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InlineError;
  } catch {
    return null;
  }
}

async function loadForUpdate(t: Tx, draftId: string, ownerId: string): Promise<DraftRow> {
  const [row] = await t<(Omit<DraftRow, "last_error"> & { last_error: string | null })[]>`
    select * from course_drafts where id = ${draftId} and owner_id = ${ownerId} for update`;
  if (!row) throw notFound("Course draft");
  return { ...row, last_error: parseError(row.last_error) };
}

export function buildTurns(topic: string, s: DraftState): DraftTurn[] {
  const turns: DraftTurn[] = [{ role: "learner", text: topic }];
  for (const a of s.answers) {
    turns.push({ role: "ada", text: a.question });
    turns.push({ role: "learner", text: a.answer });
  }
  if (s.startNow && !s.pending) turns.push({ role: "learner", text: "Start now" });
  if (s.adjustment) turns.push({ role: "learner", text: `Adjust: ${s.adjustment}` });
  return turns;
}

export function draftView(row: DraftRow): CourseDraftView {
  const s = row.state_json;
  const p = row.proposal_json;
  return {
    id: row.id,
    topic: row.topic,
    version: row.version,
    turns: buildTurns(row.topic, s),
    state: row.status,
    nextQuestion: s.pending ? { text: s.pending.question, options: s.pending.options, field: s.pending.field } : undefined,
    canGoBack: row.status !== "converted" && (s.answers.length > 0 || s.startNow),
    proposal: p
      ? {
          title: p.curriculum.title,
          direction: p.curriculum.direction,
          intent: p.interpretation.intent,
          goalText: p.interpretation.goal_text,
          initialConceptTitles: p.curriculum.concepts.map((c) => c.title),
          suggestedMinutesWeekly: p.curriculum.suggested_minutes_weekly,
          cadenceNote: p.curriculum.cadence_note,
          assumptions: p.interpretation.assumptions,
          successCriteria: p.curriculum.success_criteria.length ? p.curriculum.success_criteria : p.interpretation.success_criteria,
        }
      : undefined,
    convertedCourseId: row.converted_course_id,
    error: row.last_error,
    sourcesRead: (s.sources ?? []).map((x) => ({ url: x.url, title: x.title })),
    devModel: usingMockModel(),
  };
}

/** Safe defaults when the learner starts immediately and the model could not (or did not) interpret. */
export function fallbackInterpretation(topic: string, answers: DraftAnswer[]): Interpretation {
  const outcome = answers.find((a) => a.field === "desired_outcome")?.answer ?? "";
  const curious = !outcome || /curious|explore|ada decide/i.test(outcome);
  return {
    intent: curious ? "curiosity" : "goal",
    goal_text: (curious ? `Explore ${topic}` : outcome).slice(0, 400),
    depth: "standard",
    baseline: answers.find((a) => a.field === "baseline")?.answer ?? "",
    time_budget_minutes_weekly: null,
    success_criteria: [],
    assumptions: ["Standard depth", "Starting from the basics", curious ? "Open-ended exploration" : "Goal taken from your answer"],
    link_context: null,
  };
}

async function save(t: Tx, row: DraftRow, patch: Partial<Pick<DraftRow, "state_json" | "status" | "proposal_json" | "last_error">>) {
  const state = patch.state_json ?? row.state_json;
  const status = patch.status ?? row.status;
  const proposal = patch.proposal_json === undefined ? row.proposal_json : patch.proposal_json;
  const lastError = patch.last_error === undefined ? row.last_error : patch.last_error;
  const [updated] = await t<DraftRow[]>`
    update course_drafts set
      state_json = ${json(state)},
      turns_json = ${json(buildTurns(row.topic, state))},
      status = ${status},
      proposal_json = ${proposal ? json(proposal) : null},
      last_error = ${lastError ? JSON.stringify(lastError) : null},
      version = version + 1
    where id = ${row.id} returning *`;
  return { ...updated, last_error: lastError } as DraftRow;
}

async function readDraft(ownerId: string, draftId: string): Promise<DraftRow> {
  const [row] = await db()<(Omit<DraftRow, "last_error"> & { last_error: string | null })[]>`
    select * from course_drafts where id = ${draftId} and owner_id = ${ownerId}`;
  if (!row) throw notFound("Course draft");
  return { ...row, last_error: parseError(row.last_error) };
}

/**
 * Drives the draft forward: asks the next clarifying question, or interprets
 * and compiles a validated proposal. Model failures are recorded on the draft
 * (answers are never lost) and surfaced as a retryable inline error.
 *
 * No database connection is held while the model runs. Each step reads the
 * draft, calls the model with no transaction open, then saves in a short
 * transaction only if the draft's version is unchanged (otherwise the result
 * is discarded and the step is re-evaluated). A claim on the draft makes a
 * concurrent request wait instead of paying for a duplicate model call.
 */
async function advanceDraft(ownerId: string, draftId: string): Promise<DraftRow> {
  return withClaim(`draft:${draftId}`, async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await readDraft(ownerId, draftId);
      let state: DraftState = { ...row.state_json };
      if (state.pending || row.status !== "collecting") return row;
      /** Saves only if nobody changed the draft since we read it; null means "re-evaluate". */
      const apply = (patch: Parameters<typeof save>[2]) =>
        tx(async (t) => {
          const cur = await loadForUpdate(t, draftId, ownerId);
          return cur.version === row.version ? save(t, cur, patch) : null;
        });
      try {
        if (!state.interpretation) {
          const forced = state.startNow || state.answers.length >= MAX_QUESTIONS;
          const { value, info: clarifyInfo } = await callModel(row.owner_id, "clarify", (m) =>
            m.clarifyCourse({
              topic: row.topic,
              answers: state.answers.map(({ field, question, answer }) => ({ field, question, answer })),
              askedFields: state.answers.map((a) => a.field),
              questionsAsked: state.answers.length,
              maxQuestions: MAX_QUESTIONS,
              startNow: forced,
              linkContext: state.linkContext ?? null,
            }),
          );
          state = withLinks(state, value.status === "ask" ? value.link_context : value.interpretation.link_context, clarifyInfo.sources);
          const repeat = value.status === "ask" && state.answers.some((a) => a.field === value.field);
          if (value.status === "ask" && !forced && !repeat) {
            state = { ...state, pending: { question: value.question, options: value.quick_replies, field: value.field, reasonCode: value.reason_code } };
            const saved = await apply({ state_json: state, last_error: null });
            if (saved) return saved;
            continue;
          }
          state = { ...state, interpretation: value.status === "ready" ? value.interpretation : fallbackInterpretation(row.topic, state.answers) };
          await apply({ state_json: state, last_error: null });
          continue; // next pass compiles the plan from the saved interpretation
        }
        const interp = state.interpretation;
        const { value: curriculum, info } = await callModel(row.owner_id, "compile", (m) =>
          m.compileCurriculum({
            topic: row.topic,
            intent: interp.intent,
            goalText: interp.goal_text,
            depth: interp.depth,
            baseline: interp.baseline,
            timeBudgetMinutesWeekly: interp.time_budget_minutes_weekly,
            successCriteria: interp.success_criteria,
            assumptions: interp.assumptions,
            adjustment: state.adjustment,
            linkContext: state.linkContext ?? interp.link_context ?? null,
          }),
        );
        state = withLinks(state, null, info.sources);
        // Defense in depth: the adapter validated already; validate again before persisting.
        const checked = validateCurriculum(curriculum);
        if (!checked.ok) throw new AppError("model_invalid_output", "The generated plan was not usable. Please retry.", true);
        const saved = await apply({ state_json: state, status: "ready", proposal_json: { curriculum: checked.value, interpretation: interp, modelInfo: info }, last_error: null });
        if (saved) return saved;
      } catch (err) {
        if (!(err instanceof AppError) || !(err.retryable || err.code === "rate_limited")) throw err;
        await track(row.owner_id, "model_error", { op: "draft_advance", code: err.code });
        const saved = await apply({ state_json: state, last_error: { code: err.code, message: err.message, retryable: err.retryable } });
        return saved ?? (await readDraft(ownerId, draftId));
      }
    }
    return readDraft(ownerId, draftId);
  });
}

/** Keeps the first useful link summary and accumulates fetched pages (deduplicated by URL). */
function withLinks(state: DraftState, linkContext: string | null | undefined, fetched: FetchedSource[] | undefined): DraftState {
  const sources = new Map((state.sources ?? []).map((x) => [x.url, x]));
  for (const f of fetched ?? []) sources.set(f.url, f);
  return {
    ...state,
    linkContext: state.linkContext || (linkContext?.trim() ? linkContext.trim().slice(0, 2000) : null),
    sources: [...sources.values()].slice(0, 10),
  };
}


export const GUEST_COURSE_LIMIT = 1;

/**
 * Guests may create one course. Reads the guest flag from the database (never
 * from the client) and, inside a transaction, locks the user row so concurrent
 * conversions can't both slip under the limit.
 */
export async function assertGuestMayCreateCourse(t: Db, ownerId: string, lock = false) {
  const [u] = lock
    ? await t<{ is_guest: boolean }[]>`select is_guest from users where id = ${ownerId} for update`
    : await t<{ is_guest: boolean }[]>`select is_guest from users where id = ${ownerId}`;
  if (!u?.is_guest) return;
  const [{ n }] = await t<{ n: number }[]>`select count(*)::int as n from courses where owner_id = ${ownerId}`;
  if (n >= GUEST_COURSE_LIMIT) {
    throw new AppError("account_required", "Create a free account to make another course. Your current course comes with you.");
  }
}

export async function createDraft(ownerId: string, topic: string, idempotencyKey: string): Promise<CourseDraftView> {
  const clean = topic.replace(/\s+/g, " ").trim();
  const [already] = await db()<{ id: string }[]>`select id from course_drafts where owner_id = ${ownerId} and idempotency_key = ${idempotencyKey}`;
  if (!already) await assertGuestMayCreateCourse(db(), ownerId);
  const created = await db()<DraftRow[]>`
    insert into course_drafts (owner_id, topic, idempotency_key, state_json)
    values (${ownerId}, ${clean}, ${idempotencyKey}, ${json(emptyState())})
    on conflict (owner_id, idempotency_key) do nothing returning id`;
  if (created.length) await track(ownerId, "course_draft_started", {});
  const [existing] = await db()<{ id: string }[]>`select id from course_drafts where owner_id = ${ownerId} and idempotency_key = ${idempotencyKey}`;
  return draftView(await advanceDraft(ownerId, existing.id));
}

export async function getDraft(ownerId: string, draftId: string): Promise<CourseDraftView> {
  return draftView(await readDraft(ownerId, draftId));
}

export async function answerDraft(
  ownerId: string,
  draftId: string,
  input: { answer?: string; startNow?: boolean; expectedVersion: number; idempotencyKey: string },
): Promise<CourseDraftView> {
  // Record the answer in a short transaction; the model runs afterwards with no lock held.
  await tx(async (t) => {
    const row = await loadForUpdate(t, draftId, ownerId);
    if (row.state_json.processedKeys.includes(input.idempotencyKey)) return; // duplicate submit: just wait for the result below
    if (row.status === "converted") throw conflict("This course has already been created.", { draft: draftView(row) });
    if (row.version !== input.expectedVersion) throw conflict("This setup changed in another tab. Showing the latest.", { draft: draftView(row) });
    const s = row.state_json;
    const processedKeys = [...s.processedKeys, input.idempotencyKey].slice(-30);
    let state: DraftState;
    if (input.startNow) {
      state = { ...s, pending: null, startNow: true, processedKeys };
    } else {
      if (!s.pending) throw conflict("There is no open question to answer.", { draft: draftView(row) });
      const answer = input.answer!.trim().slice(0, 1000);
      state = { ...s, pending: null, answers: [...s.answers, { ...s.pending, answer }], processedKeys };
      await track(ownerId, "clarification_answered", { field: s.pending.field, usedQuickReply: s.pending.options.includes(answer) }, t);
    }
    await save(t, row, { state_json: state, last_error: null });
  });
  return draftView(await advanceDraft(ownerId, draftId));
}

/** "Back": reopen the last answered question and invalidate everything derived from it. */
export async function backDraft(ownerId: string, draftId: string, expectedVersion: number): Promise<CourseDraftView> {
  await tx(async (t) => {
    const row = await loadForUpdate(t, draftId, ownerId);
    if (row.status === "converted") throw conflict("This course has already been created.");
    if (row.version !== expectedVersion) throw conflict("This setup changed in another tab. Showing the latest.", { draft: draftView(row) });
    const s = row.state_json;
    let state: DraftState;
    if (s.startNow) {
      state = { ...s, startNow: false, interpretation: null, adjustment: null, pending: s.pending };
      if (!state.pending && s.answers.length) {
        const last = s.answers.at(-1)!;
        state = { ...state, answers: s.answers.slice(0, -1), pending: { question: last.question, options: last.options, field: last.field, reasonCode: last.reasonCode } };
      }
    } else if (s.answers.length) {
      const last = s.answers.at(-1)!;
      state = { ...s, answers: s.answers.slice(0, -1), interpretation: null, adjustment: null, pending: { question: last.question, options: last.options, field: last.field, reasonCode: last.reasonCode } };
    } else {
      throw conflict("Nothing to go back to.");
    }
    await save(t, row, { state_json: state, status: "collecting", proposal_json: null, last_error: null });
  });
  return draftView(await advanceDraft(ownerId, draftId)); // no-op when a question is open again
}

/** Generate or retry the proposal (also used for "Adjust" with a free-text adjustment). */
export async function proposeDraft(ownerId: string, draftId: string, input: { adjustment?: string; expectedVersion: number }): Promise<CourseDraftView> {
  await tx(async (t) => {
    const row = await loadForUpdate(t, draftId, ownerId);
    if (row.status === "converted") return;
    if (row.version !== input.expectedVersion) throw conflict("This setup changed in another tab. Showing the latest.", { draft: draftView(row) });
    if (input.adjustment?.trim()) {
      await save(t, row, { state_json: { ...row.state_json, adjustment: input.adjustment.trim().slice(0, 500) }, status: "collecting", proposal_json: null });
    }
  });
  return draftView(await advanceDraft(ownerId, draftId)); // no-op when already ready or converted
}

/** Transactionally creates the course, goal v1, concept graph and curriculum v1. Exactly once per draft. */
export async function convertDraft(ownerId: string, draftId: string): Promise<{ courseId: string; created: boolean }> {
  const result = await tx(async (t) => {
    const row = await loadForUpdate(t, draftId, ownerId);
    if (row.status === "converted" && row.converted_course_id) return { courseId: row.converted_course_id, created: false };
    if (row.status !== "ready" || !row.proposal_json) throw conflict("The course plan isn't ready yet.");
    await assertGuestMayCreateCourse(t, ownerId, true);
    const { curriculum: plan, interpretation: interp, modelInfo } = row.proposal_json;
    const [course] = await t<{ id: string }[]>`
      insert into courses (owner_id, draft_id, title, topic, intent)
      values (${ownerId}, ${row.id}, ${plan.title.slice(0, 120)}, ${row.topic}, ${interp.intent}) returning id`;
    const [goal] = await t<{ id: string }[]>`
      insert into course_goal_versions (course_id, version, intent, goal_text, success_criteria_json, time_budget_minutes_weekly, baseline_json, depth, reason)
      values (${course.id}, 1, ${interp.intent}, ${interp.goal_text}, ${json(plan.success_criteria.length ? plan.success_criteria : interp.success_criteria)},
              ${interp.time_budget_minutes_weekly ?? plan.suggested_minutes_weekly}, ${json({ text: interp.baseline, assumptions: interp.assumptions, link_context: row.state_json.linkContext ?? interp.link_context ?? null })}, ${interp.depth}, 'initial')
      returning id`;
    await t`update courses set active_goal_version_id = ${goal.id} where id = ${course.id}`;
    const ids = await insertConcepts(t, course.id, plan.concepts, 0, "initial");
    await t`insert into course_curriculum_versions (course_id, version, plan_json, reason, model_info_json)
      values (${course.id}, 1, ${json({ direction: plan.direction, required_slugs: plan.concepts.map((c) => c.slug), first_concept_slug: plan.first_concept_slug, cadence_note: plan.cadence_note, suggested_minutes_weekly: plan.suggested_minutes_weekly })}, 'initial', ${json(modelInfo)})`;
    for (const src of row.state_json.sources ?? []) {
      if (!/^https?:\/\//i.test(src.url)) continue;
      await t`insert into source_references (course_id, title, url, retrieved_at, source_type)
        values (${course.id}, ${(src.title ?? src.url).slice(0, 300)}, ${src.url.slice(0, 2000)}, ${src.retrievedAt ?? new Date().toISOString()}, 'learner_link')`;
    }
    await t`insert into course_events (course_id, event_type, payload_json) values (${course.id}, 'course_created', ${json({ concepts: ids.size, intent: interp.intent })})`;
    await t`update course_drafts set status = 'converted', converted_course_id = ${course.id}, version = version + 1 where id = ${row.id}`;
    return { courseId: course.id, created: true };
  });
  if (result.created) await track(ownerId, "course_created", { intent: "n/a" });
  return result;
}

/** Inserts validated concepts + prerequisite edges + empty mastery rows. Returns slug → id. */
export async function insertConcepts(
  t: Tx,
  courseId: string,
  concepts: CurriculumProposal["concepts"],
  startPosition: number,
  origin: "initial" | "branch" | "revision",
  existing: Map<string, string> = new Map(),
): Promise<Map<string, string>> {
  const ids = new Map(existing);
  let pos = startPosition;
  for (const c of concepts) {
    const [r] = await t<{ id: string }[]>`
      insert into concepts (course_id, slug, title, description, assessment_criteria_json, importance, position, origin)
      values (${courseId}, ${c.slug}, ${c.title}, ${c.description}, ${json(c.assessment_criteria)}, ${c.importance}, ${pos++}, ${origin}) returning id`;
    ids.set(c.slug, r.id);
    await t`insert into mastery_estimates (course_id, concept_id, status, confidence) values (${courseId}, ${r.id}, 'not_assessed', 'none')`;
  }
  for (const c of concepts) {
    for (const p of c.prerequisites) {
      const from = ids.get(p);
      if (from) await t`insert into concept_edges (course_id, from_concept_id, to_concept_id, edge_type) values (${courseId}, ${from}, ${ids.get(c.slug)!}, 'prerequisite') on conflict do nothing`;
    }
  }
  return ids;
}

/** Most recent unfinished draft (for "continue setting up" on the home screen). */
export async function latestOpenDraft(ownerId: string) {
  const [row] = await db()<{ id: string; topic: string; updated_at: Date }[]>`
    select id, topic, updated_at from course_drafts where owner_id = ${ownerId} and status <> 'converted'
    and updated_at > now() - interval '14 days' order by updated_at desc limit 1`;
  return row ?? null;
}
