import { afterAll, describe, expect, it } from "vitest";
import { call, key, makeUser, type TestUser } from "../helpers/api";
import { createCourseViaApi, startSession } from "../helpers/flows";
import * as next from "@/app/api/v1/sessions/[id]/next/route";
import * as attempts from "@/app/api/v1/activities/[id]/attempts/route";
import * as difficulty from "@/app/api/v1/sessions/[id]/difficulty/route";
import { closeDb, db } from "@/lib/db/client";
import type { SessionView } from "@/lib/schemas/dto";

afterAll(closeDb);

const prepared = (sessionId: string) =>
  db()<{ after_activity_id: string; signature: string; mode: string; status: string }[]>`
    select after_activity_id, signature, mode, status from prepared_activities where session_id = ${sessionId} order by created_at`;
const meta = async (activityId: string) =>
  (await db()<{ m: { prefetched?: boolean; prefetchMode?: string } }[]>`select model_info_json as m from activities where id = ${activityId}`)[0].m;
const purposeOf = async (activityId: string) => (await db()<{ purpose: string }[]>`select purpose from activities where id = ${activityId}`)[0].purpose;

async function answerMc(user: TestUser, s: SessionView, correct: boolean) {
  const a = s.activity!;
  const [{ spec }] = await db()<{ spec: { correctChoiceId: string } }[]>`select spec_json as spec from activities where id = ${a.id}`;
  const choiceId = correct ? spec.correctChoiceId : (a as { choices: { id: string }[] }).choices.find((c) => c.id !== spec.correctChoiceId)!.id;
  return (await call(attempts.POST, { user, params: { id: a.id }, body: { idempotencyKey: key(), response: { choiceId } } })).json.session as SessionView;
}
const advance = async (user: TestUser, s: SessionView) => (await call(next.POST, { user, params: { id: s.id }, body: { fromActivityId: s.activity!.id } })).json.session as SessionView;

describe("background preparation of the next activity", () => {
  it("prepares the step after an explanation while it's being read, and uses it", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Black holes", ["Just curious", "A deeper exploration"]);
    let s = await startSession(user, courseId, { kind: "lesson" });
    // Prediction: correct → teach, incorrect → teach (no probe for predictions) — outcome-independent.
    expect(s.activity!.purpose).toBe("prediction");
    expect((await prepared(s.id)).map((p) => p.mode)).toEqual(["presented"]);
    s = await advance(user, await answerMc(user, s, false));
    expect(s.activity!.kind).toBe("explanation");
    expect(await meta(s.activity!.id)).toMatchObject({ prefetched: true });
    // Prepared rows for the consumed step are cleaned up; the explanation has its own prepared next step.
    const rows = await prepared(s.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ after_activity_id: s.activity!.id, mode: "presented", status: "ready" });
    s = await advance(user, s);
    expect(s.activity!.purpose).toBe("check");
    expect(await meta(s.activity!.id)).toMatchObject({ prefetched: true, prefetchMode: "presented" });
  });

  it("doesn't guess when the answer decides what's next, then prepares right after grading", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Black holes", ["Just curious", "A deeper exploration"]);
    let s = await startSession(user, courseId, { kind: "lesson" });
    s = await advance(user, await answerMc(user, s, true)); // → teach
    s = await advance(user, s); // → check (correct → apply, incorrect → probe)
    expect(s.activity!.purpose).toBe("check");
    expect((await prepared(s.id)).filter((p) => p.after_activity_id === s.activity!.id)).toHaveLength(0);
    s = await answerMc(user, s, false); // graded: the real next step (probe) is prepared now
    const rows = (await prepared(s.id)).filter((p) => p.after_activity_id === s.activity!.id);
    expect(rows).toEqual([expect.objectContaining({ mode: "graded", status: "ready" })]);
    expect(rows[0].signature).toContain("|probe|");
    s = await advance(user, s);
    expect(await purposeOf(s.activity!.id)).toBe("probe");
    expect(await meta(s.activity!.id)).toMatchObject({ prefetched: true, prefetchMode: "graded" });
  });

  it("falls back to live generation when nothing matches, and re-prepares after a difficulty change", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "Black holes", ["Just curious", "A deeper exploration"]);
    let s = await startSession(user, courseId, { kind: "lesson" });
    s = await advance(user, await answerMc(user, s, true)); // → teach (explanation); next check prepared at difficulty 1
    const before = await prepared(s.id);
    expect(before.at(-1)!.signature).toMatch(/\|check\|1\|/);
    await call(difficulty.POST, { user, params: { id: s.id }, body: { offset: 1 } });
    const after = (await prepared(s.id)).filter((p) => p.after_activity_id === s.activity!.id);
    expect(after.map((p) => p.signature.split("|").slice(2, 4).join("|")).sort()).toEqual(["check|1", "check|2"]);
    s = await advance(user, s);
    const [{ d }] = await db()<{ d: number }[]>`select (spec_json->>'difficulty')::int as d from activities where id = ${s.activity!.id}`;
    expect(d).toBe(2);
    expect(await meta(s.activity!.id)).toMatchObject({ prefetched: true });

    // A failed preparation is ignored: the step is generated live.
    s = await answerMc(user, s, true);
    await db()`update prepared_activities set status = 'failed', spec_json = null where session_id = ${s.id} and after_activity_id = ${s.activity!.id}`;
    s = await advance(user, s);
    expect(s.activity).not.toBeNull();
    expect(await meta(s.activity!.id)).toMatchObject({ prefetched: false });
  });

  it("prepares placement probes ahead, since their sequence doesn't depend on answers", async () => {
    const user = await makeUser();
    const { courseId } = await createCourseViaApi(user, "I want to learn Python to automate spreadsheet tasks", ["None yet", "1 hour"]);
    let s = await startSession(user, courseId, { kind: "placement" });
    expect((await prepared(s.id))[0]).toMatchObject({ mode: "presented", status: "ready" });
    s = await advance(user, await answerMc(user, s, false));
    expect(await meta(s.activity!.id)).toMatchObject({ prefetched: true });
  });
});
