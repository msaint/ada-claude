import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { call, key, makeUser, type TestUser } from "../helpers/api";
import { createCourseViaApi, startSession } from "../helpers/flows";
import * as login from "@/app/api/v1/auth/login/route";
import * as resetRequest from "@/app/api/v1/auth/password-reset/request/route";
import * as resetConfirm from "@/app/api/v1/auth/password-reset/confirm/route";
import * as verifyRequest from "@/app/api/v1/auth/verify-email/request/route";
import * as verifyConfirm from "@/app/api/v1/auth/verify-email/confirm/route";
import * as preferences from "@/app/api/v1/preferences/route";
import * as next from "@/app/api/v1/sessions/[id]/next/route";
import * as attempts from "@/app/api/v1/activities/[id]/attempts/route";
import * as me from "@/app/api/v1/me/route";
import * as reminders from "@/app/api/cron/reminders/route";
import * as unsub from "@/app/api/email/unsubscribe/route";
import { closeDb, db } from "@/lib/db/client";
import { resetEnvCache } from "@/lib/env";
import { outbox } from "@/lib/email/mailer";
import { inQuietHours, localParts, sendDueReminders } from "@/lib/services/email";

afterAll(closeDb);
const savedEnv = { ...process.env };
beforeEach(() => {
  process.env.EMAIL_TRANSPORT = "memory";
  process.env.APP_BASE_URL = "https://ada.example.test";
  resetEnvCache();
  outbox().length = 0;
});
afterEach(() => {
  process.env = { ...savedEnv };
  resetEnvCache();
});

const tokenIn = (text: string) => /token=([\w-]+)/.exec(text)![1];
const to = (u: TestUser) => outbox().filter((m) => m.to === u.email);
/** 15:00 UTC = 10:00 in New York (test users' zone), outside the default 21:00–08:00 quiet hours. */
const DAYTIME = new Date("2026-03-10T15:00:00Z");

async function withDueReview(u: TestUser, topic = "Tides") {
  const { courseId } = await createCourseViaApi(u, topic);
  const [c] = await db()<{ id: string }[]>`select id from concepts where course_id = ${courseId} order by position limit 1`;
  await db()`insert into review_items (course_id, concept_id, owner_id, due_at) values (${courseId}, ${c.id}, ${u.id}, ${new Date(DAYTIME.getTime() - 3600e3)})`;
  return courseId;
}
const optIn = (u: TestUser) => call(preferences.PATCH, { user: u, method: "PATCH", body: { remindersEnabled: true, emailOptIn: true } });
async function verify(u: TestUser) {
  await db()`update users set email_verified_at = now() where id = ${u.id}`;
}

describe("password reset", () => {
  it("emails a single-use link that sets a new password and signs out other devices", async () => {
    const u = await makeUser();
    expect((await call(resetRequest.POST, { body: { email: u.email.toUpperCase() } })).status).toBe(200);
    const [mail] = to(u);
    expect(mail.subject).toMatch(/reset/i);
    expect(mail.text).toContain("https://ada.example.test/reset-password?token=");
    const token = tokenIn(mail.text);
    // Only a hash of the token is stored.
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from email_tokens where token_hash = ${token}`;
    expect(n).toBe(0);

    expect((await call(resetConfirm.POST, { body: { token, password: "short" } })).status).toBe(400);
    const done = await call(resetConfirm.POST, { body: { token, password: "a brand new passphrase" } });
    expect(done.status).toBe(200);
    expect(done.headers.get("set-cookie")).toContain("ada_session=");
    // The old session no longer works; the old password doesn't either; the new one does.
    expect((await call(me.GET, { user: u })).status).toBe(401);
    expect((await call(login.POST, { body: { email: u.email, password: "correct horse battery" } })).status).toBe(401);
    expect((await call(login.POST, { body: { email: u.email, password: "a brand new passphrase" } })).status).toBe(200);
    // The link can't be reused.
    expect((await call(resetConfirm.POST, { body: { token, password: "yet another passphrase" } })).status).toBe(400);
  });

  it("answers the same way for unknown addresses and sends nothing", async () => {
    const r = await call(resetRequest.POST, { body: { email: "nobody-here@example.test" } });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true });
    expect(outbox()).toHaveLength(0);
  });

  it("rejects expired links and limits how many emails one account can trigger", async () => {
    const u = await makeUser();
    for (let i = 0; i < 5; i++) await call(resetRequest.POST, { body: { email: u.email } });
    expect(to(u)).toHaveLength(3);
    const token = tokenIn(to(u)[2].text);
    await db()`update email_tokens set expires_at = now() - interval '1 minute' where user_id = ${u.id}`;
    expect((await call(resetConfirm.POST, { body: { token, password: "a brand new passphrase" } })).status).toBe(400);
  });

  it("does nothing when email isn't configured", async () => {
    process.env.EMAIL_TRANSPORT = "resend";
    delete process.env.RESEND_API_KEY;
    resetEnvCache();
    const u = await makeUser();
    expect((await call(resetRequest.POST, { body: { email: u.email } })).status).toBe(200);
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from email_tokens where user_id = ${u.id}`;
    expect(n).toBe(0);
  });
});

describe("email confirmation", () => {
  it("opting in to email reminders sends a confirmation link; confirming marks the address verified", async () => {
    const u = await makeUser();
    const r = await optIn(u);
    expect(r.json.preferences).toMatchObject({ emailOptIn: true, emailVerified: false, emailAvailable: true });
    const [mail] = to(u);
    expect(mail.text).toContain("/verify-email?token=");
    // Saving again doesn't send another.
    await optIn(u);
    expect(to(u)).toHaveLength(1);
    // Asking explicitly does.
    expect((await call(verifyRequest.POST, { user: u, body: {} })).json.sent).toBe(true);
    expect(to(u)).toHaveLength(2);

    expect((await call(verifyConfirm.POST, { body: { token: "x".repeat(43) } })).status).toBe(400);
    expect((await call(verifyConfirm.POST, { body: { token: tokenIn(mail.text) } })).status).toBe(200);
    expect((await call(preferences.GET, { user: u })).json.preferences.emailVerified).toBe(true);
    expect((await call(verifyRequest.POST, { user: u, body: {} })).json.sent).toBe(false); // nothing left to confirm
  });
});

describe("review reminders", () => {
  it("emails only learners who opted in, confirmed their address and have a review due; once per day", async () => {
    const ready = await makeUser();
    const unverified = await makeUser();
    const notOptedIn = await makeUser();
    const nothingDue = await makeUser();
    for (const u of [ready, unverified, notOptedIn]) await withDueReview(u);
    for (const u of [ready, unverified, nothingDue]) await optIn(u);
    for (const u of [ready, notOptedIn, nothingDue]) await verify(u);
    outbox().length = 0;

    await sendDueReminders(DAYTIME);
    expect(to(ready)).toHaveLength(1);
    for (const u of [unverified, notOptedIn, nothingDue]) expect(to(u)).toHaveLength(0);

    const mail = to(ready)[0];
    expect(mail.text).toContain("https://ada.example.test/app/review");
    expect(mail.headers?.["List-Unsubscribe"]).toMatch(/^<https:\/\/ada\.example\.test\/api\/email\/unsubscribe\?token=\w+>$/);
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    // Later the same local day, and concurrently: still one.
    await Promise.all([sendDueReminders(new Date(DAYTIME.getTime() + 3600e3)), sendDueReminders(new Date(DAYTIME.getTime() + 3600e3))]);
    expect(to(ready)).toHaveLength(1);
    // The next day: one more.
    await sendDueReminders(new Date(DAYTIME.getTime() + 24 * 3600e3));
    expect(to(ready)).toHaveLength(2);
  });

  it("respects quiet hours, recent study, the weekly limit and unsubscribe", async () => {
    const u = await makeUser();
    const courseId = await withDueReview(u);
    await optIn(u);
    await verify(u);
    outbox().length = 0;

    // 03:00 UTC is 23:00 in New York: quiet.
    await sendDueReminders(new Date("2026-03-10T03:00:00Z"));
    expect(to(u)).toHaveLength(0);

    // Just studied: leave them alone.
    let session = await startSession(u, courseId);
    while (session.activity!.kind === "explanation") {
      session = (await call(next.POST, { user: u, params: { id: session.id }, body: { fromActivityId: session.activity!.id } })).json.session;
    }
    const a = session.activity!;
    const response = a.kind === "multiple_choice" ? { choiceId: a.choices[0].id } : { text: "My best guess is that it follows from the first idea." };
    expect((await call(attempts.POST, { user: u, params: { id: a.id }, body: { idempotencyKey: key(), response } })).status).toBe(200);
    await db()`update attempts set submitted_at = ${new Date(DAYTIME.getTime() - 30 * 60e3)} where owner_id = ${u.id}`;
    await db()`update review_items set due_at = ${new Date(DAYTIME.getTime() - 3600e3)} where owner_id = ${u.id} and status = 'active'`;
    await sendDueReminders(DAYTIME);
    expect(to(u)).toHaveLength(0);
    await db()`update attempts set submitted_at = ${new Date(DAYTIME.getTime() - 5 * 3600e3)} where owner_id = ${u.id}`;

    // Answering rescheduled the review; make it due again for the checks below.
    await db()`update review_items set due_at = ${new Date(DAYTIME.getTime() - 3600e3)} where owner_id = ${u.id} and status = 'active'`;
    await db()`update user_preferences set weekly_nudge_limit = 2 where owner_id = ${u.id}`;
    for (let d = 0; d < 4; d++) await sendDueReminders(new Date(DAYTIME.getTime() + d * 24 * 3600e3));
    expect(to(u)).toHaveLength(2); // weekly limit

    // Unsubscribe by the link in the email (no cookie, like a mail app's one-click).
    const url = /<(.+)>/.exec(to(u)[0].headers!["List-Unsubscribe"])![1];
    const res = await unsub.POST(new Request(url, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } }));
    expect(res.status).toBe(200);
    expect((await call(preferences.GET, { user: u })).json.preferences).toMatchObject({ emailOptIn: false, remindersEnabled: true });
    await sendDueReminders(new Date(DAYTIME.getTime() + 30 * 24 * 3600e3));
    expect(to(u)).toHaveLength(2);
  });

  it("the endpoint needs the cron secret", async () => {
    const get = (headers: Record<string, string> = {}) => reminders.GET(new Request("http://localhost:3000/api/cron/reminders", { headers }));
    expect((await get()).status).toBe(401);
    process.env.CRON_SECRET = "a-long-enough-cron-secret";
    resetEnvCache();
    expect((await get({ authorization: "Bearer nope" })).status).toBe(401);
    expect((await get({ authorization: "Bearer a-long-enough-cron-secret" })).status).toBe(200);
  });

  it("escapes learner-influenced text in the email body", async () => {
    const u = await makeUser();
    const courseId = await withDueReview(u);
    await db()`update concepts set title = '<img src=x onerror=alert(1)> & co' where course_id = ${courseId}`;
    await optIn(u);
    await verify(u);
    outbox().length = 0;
    await sendDueReminders(DAYTIME);
    expect(to(u)[0].html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; co");
    expect(to(u)[0].html).not.toContain("<img");
  });
});

describe("time helpers", () => {
  it("computes local date and time, and quiet windows that wrap midnight", () => {
    expect(localParts(new Date("2026-03-10T03:30:00Z"), "America/New_York")).toEqual({ date: "2026-03-09", time: "23:30" });
    expect(localParts(new Date("2026-03-10T03:30:00Z"), "Not/AZone")).toEqual({ date: "2026-03-10", time: "03:30" });
    const q = { start: "21:00", end: "08:00" };
    expect([inQuietHours("23:30", q), inQuietHours("07:59", q), inQuietHours("08:00", q), inQuietHours("12:00", q)]).toEqual([true, true, false, false]);
    expect(inQuietHours("13:00", { start: "12:00", end: "14:00" })).toBe(true);
    expect(inQuietHours("13:00", { start: "09:00", end: "09:00" })).toBe(false);
  });
});
