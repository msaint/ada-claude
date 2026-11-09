import { afterAll, describe, expect, it } from "vitest";
import { call, key, makeUser, type TestUser } from "../helpers/api";
import { createCourseViaApi, startSession } from "../helpers/flows";
import * as sessionById from "@/app/api/v1/sessions/[id]/route";
import * as next from "@/app/api/v1/sessions/[id]/next/route";
import * as pause from "@/app/api/v1/sessions/[id]/pause/route";
import * as attempts from "@/app/api/v1/activities/[id]/attempts/route";
import * as hint from "@/app/api/v1/activities/[id]/hint/route";
import * as explain from "@/app/api/v1/activities/[id]/explain/route";
import * as draft from "@/app/api/v1/activities/[id]/draft/route";
import * as outline from "@/app/api/v1/courses/[id]/outline/route";
import * as progress from "@/app/api/v1/courses/[id]/progress/route";
import * as goals from "@/app/api/v1/courses/[id]/goals/route";
import * as branches from "@/app/api/v1/courses/[id]/branches/route";
import * as courseById from "@/app/api/v1/courses/[id]/route";
import * as due from "@/app/api/v1/reviews/due/route";
import * as reveal from "@/app/api/v1/activities/[id]/reveal/route";
import { closeDb, db } from "@/lib/db/client";
import type { SessionView } from "@/lib/schemas/dto";

afterAll(closeDb);

async function correctChoice(activityId: string) {
  const [a] = await db()<{ spec_json: { correctChoiceId: string } }[]>`select spec_json from activities where id = ${activityId}`;
  return a.spec_json.correctChoiceId;
}

/** Answers the current activity correctly (or wrongly) and advances. */
async function step(user: TestUser, s: SessionView, opts: { wrong?: boolean } = {}): Promise<SessionView> {
  const a = s.activity!;
  if (a.kind === "explanation") {
    return (await call(next.POST, { user, params: { id: s.id }, body: { fromActivityId: a.id } })).json.session;
  }
  let response: unknown;
  if (a.kind === "multiple_choice") {
    const correct = await correctChoice(a.id);
    response = { choiceId: opts.wrong ? a.choices.find((c) => c.id !== correct)!.id : correct };
  } else {
    response = { text: opts.wrong ? "no idea" : "It works because each part leads to the next effect, which means the idea holds together." };
  }
  const r = await call(attempts.POST, { user, params: { id: a.id }, body: { idempotencyKey: key(), response } });
  expect(r.status).toBe(200);
  expect(r.json.session.phase).toBe("feedback");
  return (await call(next.POST, { user, params: { id: s.id }, body: { fromActivityId: a.id } })).json.session;
}

describe("learning loop", () => {
  it("starts with a generated activity and never leaks the answer key", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Why are train wheels tapered?", ["Just curious", "Quick, five minutes"]);
    const s = await startSession(user, courseId);
    expect(s.kind).toBe("lesson");
    expect(s.phase).toBe("awaiting_response");
    expect(s.activity!.kind).toBe("multiple_choice"); // prediction before teaching
    expect(s.activity!.purpose).toBe("prediction");
    const raw = JSON.stringify((await call(sessionById.GET, { user, params: { id: s.id } })).json);
    expect(raw).not.toMatch(/correctChoiceId|rationale|idealAnswerPrivate|rubric/);
  });

  it("double submit creates exactly one attempt and one evidence record", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Black holes", ["Just curious", "A deeper exploration"]);
    const s = await startSession(user, courseId);
    const a = s.activity!;
    const correct = await correctChoice(a.id);
    const k = key();
    const results = await Promise.all([
      call(attempts.POST, { user, params: { id: a.id }, body: { idempotencyKey: k, response: { choiceId: correct } } }),
      call(attempts.POST, { user, params: { id: a.id }, body: { idempotencyKey: k, response: { choiceId: correct } } }),
      call(attempts.POST, { user, params: { id: a.id }, body: { idempotencyKey: key(), response: { choiceId: correct } } }),
    ]);
    for (const r of results) expect(r.json.session.feedback.result).toBe("correct");
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from attempts where activity_id = ${a.id}`;
    const [{ e }] = await db()<{ e: number }[]>`select count(*)::int as e from assessment_evidence e join attempts at on at.id = e.attempt_id where at.activity_id = ${a.id}`;
    expect(n).toBe(1);
    expect(e).toBe(1);
  });

  it("stale next requests do not create duplicate activities", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Chess", ["Beat casual friends", "None yet", "1 hour"]);
    const s = await startSession(user, courseId);
    const a = s.activity!;
    await call(attempts.POST, { user, params: { id: a.id }, body: { idempotencyKey: key(), response: { choiceId: await correctChoice(a.id) } } });
    const [r1, r2] = await Promise.all([
      call(next.POST, { user, params: { id: s.id }, body: { fromActivityId: a.id } }),
      call(next.POST, { user, params: { id: s.id }, body: { fromActivityId: a.id } }),
    ]);
    expect(r1.json.session.activity.id).toBe(r2.json.session.activity.id);
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from activities where session_id = ${s.id}`;
    expect(n).toBe(2);
  });

  it("cannot advance past an unanswered question", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Chess", ["Just explore"]);
    const s = await startSession(user, courseId);
    const r = await call(next.POST, { user, params: { id: s.id }, body: { fromActivityId: s.activity!.id } });
    expect(r.status).toBe(409);
  });

  it("pause + reload resumes the same activity and saved draft", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Sourdough baking", ["Just curious"]);
    let s = await startSession(user, courseId);
    s = await step(user, s); // prediction → explanation
    s = await step(user, s); // explanation → check (MC)
    s = await step(user, s); // check → apply (free response)
    expect(s.activity!.kind).toBe("free_response");
    const d = await call(draft.PUT, { user, method: "PUT", params: { id: s.activity!.id }, body: { draft: { text: "half-written thought" }, baseVersion: 0 } });
    expect(d.json.version).toBe(1);
    const conflictRes = await call(draft.PUT, { user, method: "PUT", params: { id: s.activity!.id }, body: { draft: { text: "other tab" }, baseVersion: 0 } });
    expect(conflictRes.status).toBe(409);
    await call(pause.POST, { user, params: { id: s.id } });
    const resumed = await startSession(user, courseId);
    expect(resumed.id).toBe(s.id);
    expect(resumed.activity!.id).toBe(s.activity!.id);
    expect(resumed.draft!.value.text).toBe("half-written thought");
    const view = await call(sessionById.GET, { user, params: { id: s.id } });
    expect(view.json.session.activity.id).toBe(s.activity!.id);
  });

  it("hints mark the attempt as assisted and assisted success does not demonstrate", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Chess", ["Beat casual friends", "None yet", "1 hour"]);
    const s = await startSession(user, courseId);
    const a = s.activity!;
    const k = key();
    const h1 = await call(hint.POST, { user, params: { id: a.id }, body: { idempotencyKey: k } });
    const h1dup = await call(hint.POST, { user, params: { id: a.id }, body: { idempotencyKey: k } });
    expect(h1.json.hints).toHaveLength(1);
    expect(h1dup.json.hints).toHaveLength(1);
    const ex = await call(explain.POST, { user, params: { id: a.id }, body: { idempotencyKey: key() } });
    expect(ex.json.altExplanations).toHaveLength(1);
    const r = await call(attempts.POST, { user, params: { id: a.id }, body: { idempotencyKey: key(), response: { choiceId: await correctChoice(a.id) } } });
    expect(r.json.session.feedback).toMatchObject({ result: "correct", independence: "assisted" });
    const [ev] = await db()<{ independence: string }[]>`select independence from assessment_evidence where concept_id = (select concept_id from activities where id = ${a.id})`;
    expect(ev.independence).toBe("assisted");
    const [at] = await db()<{ hint_count: number; explanation_revealed: boolean }[]>`select hint_count, explanation_revealed from attempts where activity_id = ${a.id}`;
    expect(at).toEqual({ hint_count: 1, explanation_revealed: true });
  });

  it("evidence drives mastery, schedules review, and feeds outline/progress", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "I want to learn Python to automate spreadsheet tasks", ["None yet", "1 hour"]);
    let s = await startSession(user, courseId);
    const conceptTitle = s.activity!.conceptTitle;
    const statusOf = async () =>
      (await call(outline.GET, { user, params: { id: courseId } })).json.outline.concepts.find((x: { title: string }) => x.title === conceptTitle);
    // predict → teach → check → apply → devil's advocate (all "prompted": back-to-back on one concept),
    // then other work, then an interleaved unprompted recall check completes the evidence.
    const path: string[] = [];
    for (let i = 0; i < 12 && (await statusOf()).status !== "demonstrated"; i++) {
      if (s.status === "completed" || !s.activity) s = await startSession(user, courseId, { kind: "lesson" });
      path.push(`${s.activity!.purpose}${s.activity!.conceptTitle === conceptTitle ? "" : "*"}`);
      s = await step(user, s);
      if (i === 4) expect((await statusOf()).status).toBe("developing"); // ready except for unprompted recall
    }
    expect(path.slice(0, 5)).toEqual(["prediction", "teach", "check", "apply", "defend"]);
    expect(path).toContain("recall");
    expect(path.indexOf("recall")).toBeGreaterThan(path.findIndex((p) => p.endsWith("*"))); // other work came first
    const c = await statusOf();
    expect(c.status).toBe("demonstrated");
    expect(c.evidence.length).toBeGreaterThanOrEqual(4);
    if (s.status !== "completed") await call(pause.POST, { user, params: { id: s.id } });

    const p = await call(progress.GET, { user, params: { id: courseId } });
    expect(p.json.progress.canDo.map((x: { title: string }) => x.title)).toContain(conceptTitle);
    expect(p.json.progress.readiness.band).not.toBe("demonstrated");
    expect(JSON.stringify(p.json.progress)).not.toMatch(/%/);
    expect(p.json.progress.dueToRevisit.length).toBeGreaterThan(0);

    // nothing due yet (first review is +1 day)
    expect((await call(due.GET, { user })).json.due).toHaveLength(0);
    // time travel: make the review due now
    await db()`update review_items set due_at = now() - interval '1 minute' where course_id = ${courseId}`;
    const dueNow = (await call(due.GET, { user })).json.due;
    expect(dueNow.length).toBeGreaterThan(0);
    expect(dueNow[0].courseId).toBe(courseId);

    // a review session starts from the due item with a fresh variant
    const rv = await startSession(user, courseId, { kind: "review" });
    expect(rv.kind).toBe("review");
    expect(rv.activity!.purpose).toBe("review");
    const [{ prompts }] = await db()<{ prompts: number }[]>`
      select count(distinct spec_json->>'promptMarkdown')::int as prompts from activities where course_id = ${courseId} and concept_id = (select concept_id from activities where id = ${rv.activity!.id})`;
    const [{ total }] = await db()<{ total: number }[]>`
      select count(*)::int as total from activities where course_id = ${courseId} and kind <> 'explanation' and concept_id = (select concept_id from activities where id = ${rv.activity!.id})`;
    expect(prompts).toBe(total); // never repeats an identical question
    const before = await db()<{ interval_days: number }[]>`select interval_days from review_items where id = (select review_item_id from activities where id = ${rv.activity!.id})`;
    await step(user, rv);
    const after = await db()<{ interval_days: number; due_at: Date }[]>`select interval_days, due_at from review_items where id = (select review_item_id from activities where id = ${rv.activity!.id})`;
    expect(after[0].interval_days).toBeGreaterThan(before[0].interval_days);
    expect(after[0].due_at.getTime()).toBeGreaterThan(Date.now());
  });

  it("a wrong answer is not revealed: a narrower probe comes first, a direct explanation only after a second miss", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Black holes", ["Just curious", "A deeper exploration"]);
    let s = await startSession(user, courseId);
    s = await step(user, s); // prediction
    s = await step(user, s); // teach
    expect(s.activity!.purpose).toBe("check");
    const checkId = s.activity!.id;
    const correctId = await correctChoice(checkId);
    const miss = await call(attempts.POST, { user, params: { id: checkId }, body: { idempotencyKey: key(), response: { choiceId: (s.activity as { choices: { id: string }[] }).choices.find((c) => c.id !== correctId)!.id } } });
    expect(miss.json.session.feedback).toMatchObject({ result: "incorrect", withheld: true });
    expect(JSON.stringify(miss.json.session.feedback)).not.toMatch(/correctChoiceId|rationale/);
    // "Show me the answer" reveals it on request
    const rev = await call(reveal.POST, { user, params: { id: checkId } });
    expect(rev.json.session.feedback).toMatchObject({ correctChoiceId: correctId, revealed: true, withheld: false });
    s = (await call(next.POST, { user, params: { id: s.id }, body: { fromActivityId: checkId } })).json.session;
    expect(s.activity!).toMatchObject({ kind: "multiple_choice", purpose: "probe" });
    s = await step(user, s, { wrong: true }); // second miss
    expect(s.activity!).toMatchObject({ kind: "explanation", purpose: "remediate" });
    s = await step(user, s);
    expect(s.activity!).toMatchObject({ purpose: "check" }); // immediate re-test from a different angle
  });

  it("free response is graded against a rubric and stored with evaluator metadata", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Black holes", ["Just curious", "A deeper exploration"]);
    let s = await startSession(user, courseId);
    for (let i = 0; i < 3; i++) s = await step(user, s);
    expect(s.activity!.kind).toBe("free_response");
    const r = await call(attempts.POST, { user, params: { id: s.activity!.id }, body: { idempotencyKey: key(), response: { text: "Gravity is so strong that light cannot escape because the escape speed exceeds c, which means it is dark." } } });
    expect(r.json.session.feedback.status).toBe("graded");
    expect(r.json.session.feedback.criteria.length).toBeGreaterThan(0);
    const [ev] = await db()<{ evaluator_json: { type: string; provider: string } }[]>`
      select e.evaluator_json from assessment_evidence e join attempts at on at.id = e.attempt_id where at.activity_id = ${s.activity!.id}`;
    expect(ev.evaluator_json).toMatchObject({ type: "model_rubric", provider: "mock" });
  });

  it("goal revision keeps evidence, versions the goal, and changes the plan", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "I want to learn Python to automate spreadsheet tasks", ["None yet", "1 hour"]);
    let s = await startSession(user, courseId);
    for (let i = 0; i < 3; i++) s = await step(user, s);
    const [{ before }] = await db()<{ before: number }[]>`select count(*)::int as before from assessment_evidence where course_id = ${courseId}`;
    const r = await call(goals.POST, { user, params: { id: courseId }, body: { goalText: "Python for data visualization", reason: "New project at work" } });
    expect(r.status).toBe(201);
    expect(r.json.goalVersion).toBe(2);
    const [{ after }] = await db()<{ after: number }[]>`select count(*)::int as after from assessment_evidence where course_id = ${courseId}`;
    expect(after).toBe(before);
    const h = await call(courseById.GET, { user, params: { id: courseId } });
    expect(h.json.course.goal.text).toBe("Python for data visualization");
    expect(h.json.course.goalHistory).toHaveLength(2);
    const o = await call(outline.GET, { user, params: { id: courseId } });
    expect(o.json.outline.curriculumVersion).toBe(2);
    expect(o.json.outline.concepts.some((c: { origin: string }) => c.origin === "revision")).toBe(true);
    expect(o.json.outline.concepts.some((c: { inCurrentPlan: boolean }) => !c.inCurrentPlan)).toBe(true);
  });

  it("curiosity branches extend the same course graph", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Why are train wheels tapered?", ["Just curious", "Quick, five minutes"]);
    const before = (await call(outline.GET, { user, params: { id: courseId } })).json.outline.concepts.length;
    const b = await call(branches.POST, { user, params: { id: courseId }, body: { question: "wheel wear" } });
    expect(b.status).toBe(201);
    const o = (await call(outline.GET, { user, params: { id: courseId } })).json.outline;
    expect(o.concepts.length).toBe(before + 1);
    expect(o.concepts.find((c: { origin: string }) => c.origin === "branch").title).toMatch(/wheel wear/i);
    const s = await startSession(user, courseId, { focusConceptId: b.json.firstConceptId });
    expect(s.activity).not.toBeNull();
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from courses where owner_id = ${user.id}`;
    expect(n).toBe(1);
  });

  it("curiosity progress never shows completion percentages", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Why are train wheels tapered?", ["Just curious", "Quick, five minutes"]);
    const p = (await call(progress.GET, { user, params: { id: courseId } })).json.progress;
    expect(p.intent).toBe("curiosity");
    expect(p.readiness).toBeUndefined();
    expect(p.curiosity).toBeDefined();
    expect(JSON.stringify(p)).not.toMatch(/percent|%/i);
  });
});
