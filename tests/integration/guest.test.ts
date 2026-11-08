import { afterAll, describe, expect, it } from "vitest";
import { call, key, makeUser, type TestUser } from "../helpers/api";
import { createCourseViaApi, startSession } from "../helpers/flows";
import * as guest from "@/app/api/v1/auth/guest/route";
import * as signup from "@/app/api/v1/auth/signup/route";
import * as login from "@/app/api/v1/auth/login/route";
import * as me from "@/app/api/v1/me/route";
import * as courses from "@/app/api/v1/courses/route";
import * as drafts from "@/app/api/v1/course-drafts/route";
import * as answer from "@/app/api/v1/course-drafts/[id]/answer/route";
import * as convert from "@/app/api/v1/course-drafts/[id]/convert/route";
import * as attempts from "@/app/api/v1/activities/[id]/attempts/route";
import * as account from "@/app/api/v1/account/route";
import { closeDb, db } from "@/lib/db/client";
import { purgeStaleGuests } from "@/lib/auth/session";

afterAll(closeDb);

const cookieFrom = (h: Headers) => (h.get("set-cookie") ?? "").split(";")[0];

async function newGuest(ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`): Promise<TestUser> {
  const r = await call(guest.POST, { body: { timezone: "Europe/Paris" }, headers: { "x-forwarded-for": `${ip}, 1.1.1.1` } });
  expect(r.status).toBe(201);
  return { id: r.json.user.id, email: "", cookie: cookieFrom(r.headers) };
}

async function readyDraft(user: TestUser, topic: string) {
  const d = (await call(drafts.POST, { user, body: { topic, idempotencyKey: key() } })).json.draft;
  return (await call(answer.POST, { user, params: { id: d.id }, body: { startNow: true, expectedVersion: d.version, idempotencyKey: key() } })).json.draft;
}

describe("guest users", () => {
  it("a visitor gets a guest session and can create a course and answer a question without an account", async () => {
    const g = await newGuest();
    const who = await call(me.GET, { user: g });
    expect(who.status).toBe(200);
    const { courseId } = await createCourseViaApi(g, "Black holes", ["Just curious", "Quick, five minutes"]);
    const s = await startSession(g, courseId);
    const [{ spec }] = await db()<{ spec: { correctChoiceId: string } }[]>`select spec_json as spec from activities where id = ${s.activity!.id}`;
    const r = await call(attempts.POST, { user: g, params: { id: s.activity!.id }, body: { idempotencyKey: key(), response: { choiceId: spec.correctChoiceId } } });
    expect(r.json.session.feedback.result).toBe("correct");
    // Calling the guest endpoint again with the cookie returns the same identity
    const again = await call(guest.POST, { user: g, body: {} });
    expect(again.json.user.id).toBe(g.id);
  });

  it("guests are limited to one course; a second draft or conversion requires an account", async () => {
    const g = await newGuest();
    await createCourseViaApi(g, "Chess", ["Just explore"]);
    const second = await call(drafts.POST, { user: g, body: { topic: "Knots", idempotencyKey: key() } });
    expect(second.status).toBe(403);
    expect(second.json.error.code).toBe("account_required");
  });

  it("concurrent conversions of two drafts still create only one guest course", async () => {
    const g = await newGuest();
    const a = await readyDraft(g, "Tides");
    const b = await readyDraft(g, "Volcanoes");
    const results = await Promise.all([call(convert.POST, { user: g, params: { id: a.id }, body: {} }), call(convert.POST, { user: g, params: { id: b.id }, body: {} })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from courses where owner_id = ${g.id}`;
    expect(n).toBe(1);
  });

  it("signing up as a guest upgrades in place and keeps the course, then lifts the limit", async () => {
    const g = await newGuest();
    const { courseId } = await createCourseViaApi(g, "Chess", ["Just explore"]);
    const email = `up-${key().slice(0, 6)}@example.test`;
    const r = await call(signup.POST, { user: g, body: { email, password: "long enough pw" } });
    expect(r.status).toBe(201);
    expect(r.json.keptGuestData).toBe(true);
    expect(r.json.user.id).toBe(g.id);
    const upgraded: TestUser = { id: g.id, email, cookie: cookieFrom(r.headers) };
    expect((await call(courses.GET, { user: upgraded })).json.courses.map((c: { id: string }) => c.id)).toEqual([courseId]);
    const second = await call(drafts.POST, { user: upgraded, body: { topic: "Knots", idempotencyKey: key() } });
    expect(second.status).toBe(201);
    const [{ is_guest }] = await db()<{ is_guest: boolean }[]>`select is_guest from users where id = ${g.id}`;
    expect(is_guest).toBe(false);
  });

  it("signing in to an existing account moves the guest's course into it", async () => {
    const existing = await makeUser();
    await createCourseViaApi(existing, "Sourdough", ["Just curious"]);
    const g = await newGuest();
    const { courseId } = await createCourseViaApi(g, "Black holes", ["Just curious"]);
    const r = await call(login.POST, { user: g, body: { email: existing.email, password: "correct horse battery" } });
    expect(r.status).toBe(200);
    expect(r.json.mergedGuestData).toBe(true);
    const list = (await call(courses.GET, { user: existing })).json.courses.map((c: { id: string }) => c.id);
    expect(list).toContain(courseId);
    expect(list).toHaveLength(2);
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from users where id = ${g.id}`;
    expect(n).toBe(0);
    const [{ ev }] = await db()<{ ev: number }[]>`select count(*)::int as ev from sessions where owner_id = ${g.id}`;
    expect(ev).toBe(0);
  });

  it("guest creation is rate-limited per IP", async () => {
    process.env.ADA_GUEST_CREATIONS_PER_HOUR = "2";
    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
    try {
      const ip = "203.0.113.77";
      await newGuest(ip);
      await newGuest(ip);
      const third = await call(guest.POST, { body: {}, headers: { "x-forwarded-for": ip } });
      expect(third.status).toBe(429);
    } finally {
      delete process.env.ADA_GUEST_CREATIONS_PER_HOUR;
      resetEnvCache();
    }
  });

  it("guests have a smaller daily model budget and are told to create an account", async () => {
    const g = await newGuest();
    await db()`insert into model_usage (owner_id, operation, provider, model, ok, latency_ms, created_at)
      select ${g.id}, 'activity', 'mock', 'x', true, 1, now() - interval '2 hours' from generate_series(1, 60)`;
    const r = await call(drafts.POST, { user: g, body: { topic: "Knots", idempotencyKey: key() } });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("account_required");
  });

  it("guests can delete their data by typing 'delete'", async () => {
    const g = await newGuest();
    expect((await call(account.DELETE, { user: g, method: "DELETE", body: { confirmEmail: "nope" } })).status).toBe(400);
    expect((await call(account.DELETE, { user: g, method: "DELETE", body: { confirmEmail: "delete" } })).status).toBe(200);
  });

  it("stale guests (all sessions expired) are purged with their data", async () => {
    const g = await newGuest();
    await createCourseViaApi(g, "Chess", ["Just explore"]);
    await db()`update users set created_at = now() - interval '20 days' where id = ${g.id}`;
    await db()`update auth_sessions set expires_at = now() - interval '2 days' where user_id = ${g.id}`;
    await purgeStaleGuests();
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from courses where owner_id = ${g.id}`;
    expect(n).toBe(0);
    expect((await call(courses.GET, { user: g })).status).toBe(401);
  });
});
