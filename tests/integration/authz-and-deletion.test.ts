import { afterAll, describe, expect, it } from "vitest";
import { call, key, makeUser } from "../helpers/api";
import { createCourseViaApi, startSession } from "../helpers/flows";
import * as courses from "@/app/api/v1/courses/route";
import * as courseById from "@/app/api/v1/courses/[id]/route";
import * as outline from "@/app/api/v1/courses/[id]/outline/route";
import * as progress from "@/app/api/v1/courses/[id]/progress/route";
import * as goals from "@/app/api/v1/courses/[id]/goals/route";
import * as sessionsRoute from "@/app/api/v1/courses/[id]/sessions/route";
import * as sessionById from "@/app/api/v1/sessions/[id]/route";
import * as next from "@/app/api/v1/sessions/[id]/next/route";
import * as attempts from "@/app/api/v1/activities/[id]/attempts/route";
import * as hint from "@/app/api/v1/activities/[id]/hint/route";
import * as draftRoute from "@/app/api/v1/activities/[id]/draft/route";
import * as drafts from "@/app/api/v1/course-drafts/route";
import * as draftById from "@/app/api/v1/course-drafts/[id]/route";
import * as convert from "@/app/api/v1/course-drafts/[id]/convert/route";
import * as due from "@/app/api/v1/reviews/due/route";
import * as prefs from "@/app/api/v1/preferences/route";
import * as account from "@/app/api/v1/account/route";
import * as exportRoute from "@/app/api/v1/account/export/route";
import * as signup from "@/app/api/v1/auth/signup/route";
import * as login from "@/app/api/v1/auth/login/route";
import { closeDb, db } from "@/lib/db/client";

afterAll(closeDb);

describe("authorization", () => {
  it("rejects unauthenticated requests", async () => {
    const r = await call(courses.GET, { user: null });
    expect(r.status).toBe(401);
    expect(r.json.error).toMatchObject({ code: "unauthenticated", retryable: false });
    expect(typeof r.json.requestId).toBe("string");
  });

  it("another user cannot read or mutate a course, session, activity or draft by ID", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const { courseId } = await createCourseViaApi(owner, "Chess", ["Beat casual friends", "None yet", "1 hour"]);
    const s = await startSession(owner, courseId);
    const activityId = s.activity!.id;
    const { json } = await call(drafts.POST, { user: owner, body: { topic: "Knots", idempotencyKey: key() } });

    const attemptsToMake = [
      call(courseById.GET, { user: intruder, params: { id: courseId } }),
      call(courseById.PATCH, { user: intruder, method: "PATCH", params: { id: courseId }, body: { title: "pwned", expectedVersion: 1 } }),
      call(courseById.DELETE, { user: intruder, method: "DELETE", params: { id: courseId } }),
      call(outline.GET, { user: intruder, params: { id: courseId } }),
      call(progress.GET, { user: intruder, params: { id: courseId } }),
      call(goals.POST, { user: intruder, params: { id: courseId }, body: { goalText: "something else" } }),
      call(sessionsRoute.POST, { user: intruder, params: { id: courseId }, body: {} }),
      call(sessionById.GET, { user: intruder, params: { id: s.id } }),
      call(next.POST, { user: intruder, params: { id: s.id }, body: { fromActivityId: activityId } }),
      call(attempts.POST, { user: intruder, params: { id: activityId }, body: { idempotencyKey: key(), response: { choiceId: "a" } } }),
      call(hint.POST, { user: intruder, params: { id: activityId }, body: { idempotencyKey: key() } }),
      call(draftRoute.PUT, { user: intruder, method: "PUT", params: { id: activityId }, body: { draft: { text: "x" }, baseVersion: 0 } }),
      call(draftById.GET, { user: intruder, params: { id: json.draft.id } }),
      call(convert.POST, { user: intruder, params: { id: json.draft.id }, body: {} }),
    ];
    for (const r of await Promise.all(attemptsToMake)) {
      expect(r.status).toBe(404);
      expect(r.json.error.code).toBe("not_found");
    }
    expect((await call(courses.GET, { user: intruder })).json.courses).toEqual([]);
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from attempts where activity_id = ${activityId}`;
    expect(n).toBe(0);
  });

  it("non-UUID ids are 404, cross-site and non-JSON mutations are refused", async () => {
    const user = await makeUser();
    expect((await call(courseById.GET, { user, params: { id: "../../etc" } })).status).toBe(404);
    const cross = await call(drafts.POST, { user, body: { topic: "x", idempotencyKey: key() }, headers: { origin: "https://evil.example" } });
    expect(cross.status).toBe(403);
    const form = await call(drafts.POST, { user, body: "topic=x", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(form.status).toBe(415);
    const big = await call(drafts.POST, { user, body: { topic: "x", idempotencyKey: key(), pad: "y".repeat(70_000) } });
    expect(big.status).toBe(413);
  });
});

describe("auth", () => {
  it("signs up, rejects duplicates and bad passwords, and signs in", async () => {
    const email = `new-${key().slice(0, 6)}@example.test`;
    const r = await call(signup.POST, { body: { email, password: "long enough pw", timezone: "Europe/Paris" } });
    expect(r.status).toBe(201);
    expect(r.headers.get("set-cookie")).toMatch(/ada_session=.*HttpOnly; SameSite=Lax/);
    expect((await call(signup.POST, { body: { email, password: "long enough pw" } })).status).toBe(409);
    expect((await call(login.POST, { body: { email, password: "wrong password" } })).status).toBe(401);
    const ok = await call(login.POST, { body: { email: email.toUpperCase(), password: "long enough pw" } });
    expect(ok.status).toBe(200);
  });
});

describe("deletion and preferences", () => {
  it("deleting one course removes its learner data and leaves other courses intact", async () => {
    const user = await makeUser();
    const holes = await createCourseViaApi(user, "Black holes", ["Just curious", "Quick, five minutes"]);
    const chess = await createCourseViaApi(user, "Chess", ["Beat casual friends", "None yet", "1 hour"]);
    const s = await startSession(user, chess.courseId);
    const a = s.activity!;
    const [{ spec }] = await db()<{ spec: { correctChoiceId: string } }[]>`select spec_json as spec from activities where id = ${a.id}`;
    await call(attempts.POST, { user, params: { id: a.id }, body: { idempotencyKey: key(), response: { choiceId: spec.correctChoiceId } } });
    await startSession(user, holes.courseId);

    const del = await call(courseById.DELETE, { user, method: "DELETE", params: { id: chess.courseId } });
    expect(del.status).toBe(200);
    const list = (await call(courses.GET, { user })).json.courses;
    expect(list.map((c: { id: string }) => c.id)).toEqual([holes.courseId]);
    for (const table of ["sessions", "activities", "concepts", "assessment_evidence", "review_items", "mastery_estimates", "course_goal_versions"]) {
      const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from ${db()(table)} where course_id = ${chess.courseId}`;
      expect(n, table).toBe(0);
    }
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from attempts where activity_id = ${a.id}`;
    expect(n).toBe(0);
    expect((await call(courseById.GET, { user, params: { id: chess.courseId } })).status).toBe(404);
    expect((await call(sessionById.GET, { user, params: { id: s.id } })).status).toBe(404);
    expect((await call(courseById.GET, { user, params: { id: holes.courseId } })).status).toBe(200);
    expect((await call(due.GET, { user })).status).toBe(200);
  });

  it("reminders are off by default and email consent requires reminders", async () => {
    const user = await makeUser();
    const p = (await call(prefs.GET, { user })).json.preferences;
    expect(p).toMatchObject({ remindersEnabled: false, emailOptIn: false, timezone: "America/New_York" });
    const r = await call(prefs.PATCH, { user, method: "PATCH", body: { emailOptIn: true } });
    expect(r.json.preferences.emailOptIn).toBe(false);
    const r2 = await call(prefs.PATCH, { user, method: "PATCH", body: { remindersEnabled: true, emailOptIn: true, timezone: "Not/AZone" } });
    expect(r2.json.preferences).toMatchObject({ remindersEnabled: true, emailOptIn: true, timezone: "UTC" });
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from notification_log where owner_id = ${user.id}`;
    expect(n).toBe(0);
  });

  it("exports and deletes the account", async () => {
    const user = await makeUser();
    await createCourseViaApi(user, "Chess", ["Just explore"]);
    const ex = await call(exportRoute.GET, { user });
    expect(ex.status).toBe(200);
    expect(ex.json.courses).toHaveLength(1);
    expect(JSON.stringify(ex.json)).not.toMatch(/password_hash/);
    expect((await call(account.DELETE, { user, method: "DELETE", body: { confirmEmail: "nope@example.test" } })).status).toBe(400);
    const del = await call(account.DELETE, { user, method: "DELETE", body: { confirmEmail: user.email } });
    expect(del.status).toBe(200);
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from courses where owner_id = ${user.id}`;
    expect(n).toBe(0);
    expect((await call(courses.GET, { user })).status).toBe(401);
  });
});
