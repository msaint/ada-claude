import { afterAll, describe, expect, it } from "vitest";
import { call, key, makeUser, type TestUser } from "../helpers/api";
import { createCourseViaApi, startSession } from "../helpers/flows";
import * as courseById from "@/app/api/v1/courses/[id]/route";
import * as progress from "@/app/api/v1/courses/[id]/progress/route";
import * as sessions from "@/app/api/v1/courses/[id]/sessions/route";
import * as next from "@/app/api/v1/sessions/[id]/next/route";
import * as difficulty from "@/app/api/v1/sessions/[id]/difficulty/route";
import * as attempts from "@/app/api/v1/activities/[id]/attempts/route";
import * as hint from "@/app/api/v1/activities/[id]/hint/route";
import * as explain from "@/app/api/v1/activities/[id]/explain/route";
import { closeDb, db } from "@/lib/db/client";
import type { SessionView } from "@/lib/schemas/dto";

afterAll(closeDb);

const GOAL = "I want to learn Python to automate spreadsheet tasks";

async function answer(user: TestUser, s: SessionView, correct: boolean): Promise<SessionView> {
  const a = s.activity!;
  let response: unknown;
  if (a.kind === "multiple_choice") {
    const [{ spec }] = await db()<{ spec: { correctChoiceId: string } }[]>`select spec_json as spec from activities where id = ${a.id}`;
    response = { choiceId: correct ? spec.correctChoiceId : a.choices.find((c) => c.id !== spec.correctChoiceId)!.id };
  } else {
    response = { text: correct ? "It works because each part leads to the next effect, which means the idea holds together." : "no idea" };
  }
  const r = await call(attempts.POST, { user, params: { id: a.id }, body: { idempotencyKey: key(), response } });
  expect(r.status).toBe(200);
  return r.json.session;
}
const advance = async (user: TestUser, s: SessionView) => (await call(next.POST, { user, params: { id: s.id }, body: { fromActivityId: s.activity?.id ?? null } })).json.session as SessionView;

describe("placement diagnostic", () => {
  it("is suggested for new goal courses, teaches nothing, and proposes a starting point", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, GOAL, ["None yet", "1 hour"]);
    const header = (await call(courseById.GET, { user, params: { id: courseId } })).json.course;
    expect(header.nextAction).toMatchObject({ kind: "placement", label: "Find your starting point" });

    let s = await startSession(user, courseId, { kind: "placement" });
    expect(s.kind).toBe("placement");
    // No help during placement
    expect((await call(hint.POST, { user, params: { id: s.activity!.id }, body: { idempotencyKey: key() } })).status).toBe(409);
    expect((await call(explain.POST, { user, params: { id: s.activity!.id }, body: { idempotencyKey: key() } })).status).toBe(409);

    const kinds: string[] = [];
    let i = 0;
    while (s.status !== "completed") {
      expect(s.activity!.purpose).toBe("placement");
      kinds.push(s.activity!.kind);
      s = await answer(user, s, i === 0); // know the first concept only
      if (i > 0) {
        expect(s.feedback!.withheld).toBe(true); // misses aren't revealed during placement
        expect(JSON.stringify(s.feedback)).not.toMatch(/correctChoiceId|rationale|exampleAnswer/);
      }
      s = await advance(user, s);
      i++;
    }
    expect(kinds.every((k) => k === "multiple_choice" || k === "free_response")).toBe(true);
    expect(s.summary!.placement!.length).toBe(kinds.length);
    expect(s.summary!.placement![0].result).toBe("correct");
    const suggested = s.summary!.suggestedConceptId;
    expect(typeof suggested).toBe("string");
    expect(suggested).not.toBe(s.summary!.placement![0].conceptId);

    // Learner accepts the suggestion: the lesson starts on that concept
    const lesson = await startSession(user, courseId, { focusConceptId: suggested! });
    expect(lesson.kind).toBe("lesson");
    const [{ concept_id }] = await db()<{ concept_id: string }[]>`select concept_id from activities where id = ${lesson.activity!.id}`;
    expect(concept_id).toBe(suggested);
  });

  it("is not suggested for curiosity courses", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Black holes", ["Just curious", "A deeper exploration"]);
    const header = (await call(courseById.GET, { user, params: { id: courseId } })).json.course;
    expect(header.nextAction.kind).toBe("learn");
  });
});

describe("harder / easier", () => {
  it("shifts the difficulty of the next assessment in the lesson", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Black holes", ["Just curious", "A deeper exploration"]);
    let s = await startSession(user, courseId, { kind: "lesson" });
    s = await advance(user, await answer(user, s, true)); // prediction → teach
    const set = await call(difficulty.POST, { user, params: { id: s.id }, body: { offset: 1 } });
    expect(set.json.session.difficultyOffset).toBe(1);
    s = await advance(user, s); // teach → first check (d1 + 1)
    expect(s.activity!.purpose).toBe("check");
    const [{ d }] = await db()<{ d: number }[]>`select (spec_json->>'difficulty')::int as d from activities where id = ${s.activity!.id}`;
    expect(d).toBe(2);
    expect((await call(difficulty.POST, { user, params: { id: s.id }, body: { offset: 5 } })).status).toBe(400);
  });
});

describe("final mixed assessment", () => {
  it("unlocks only when every plan concept is demonstrated, and its result gates readiness", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, GOAL, ["None yet", "1 hour"]);
    const locked = await call(sessions.POST, { user, params: { id: courseId }, body: { kind: "assessment" } });
    expect(locked.status).toBe(409);

    await db()`update mastery_estimates set status = 'demonstrated' where course_id = ${courseId}`;
    const header = (await call(courseById.GET, { user, params: { id: courseId } })).json.course;
    expect(header.nextAction).toMatchObject({ kind: "assessment" });

    let s = await startSession(user, courseId, { kind: "assessment" });
    const purposes: string[] = [];
    while (s.status !== "completed") {
      purposes.push(s.activity!.purpose);
      expect((await call(hint.POST, { user, params: { id: s.activity!.id }, body: { idempotencyKey: key() } })).status).toBe(409);
      s = await advance(user, await answer(user, s, true));
    }
    expect(purposes.at(-1)).toBe("integrative");
    expect(purposes.slice(0, -1).every((p) => p === "final")).toBe(true);
    expect(s.summary!.assessment).toEqual({ passed: true, missed: [] });
    const [ev] = await db()<{ payload_json: { passed: boolean } }[]>`select payload_json from course_events where course_id = ${courseId} and event_type = 'final_assessment'`;
    expect(ev.payload_json.passed).toBe(true);
    const p = (await call(progress.GET, { user, params: { id: courseId } })).json.progress;
    expect(p.readiness.basis).not.toMatch(/Take the final check/);
  });

  it("a failed final check lists what to practise", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, GOAL, ["None yet", "1 hour"]);
    await db()`update mastery_estimates set status = 'demonstrated' where course_id = ${courseId}`;
    let s = await startSession(user, courseId, { kind: "assessment" });
    let i = 0;
    while (s.status !== "completed") {
      s = await advance(user, await answer(user, s, i !== 0));
      i++;
    }
    expect(s.summary!.assessment!.passed).toBe(false);
    expect(s.summary!.assessment!.missed.length).toBe(1);
  });
});
