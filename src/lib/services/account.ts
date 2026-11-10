import { db, json, tx } from "@/lib/db/client";
import { AppError, notFound } from "@/lib/errors";
import { formatInZone, postpone } from "@/lib/learning/review-scheduler";
import { safeZone } from "@/lib/auth/session";
import { emailEnabled } from "@/lib/email/mailer";
import { sendVerification } from "@/lib/services/email";
import type { DueReview } from "@/lib/schemas/dto";

export async function dueReviews(ownerId: string, timezone: string, includeUpcoming = false): Promise<{ due: DueReview[]; upcoming: DueReview[] }> {
  const rows = await db()<{ id: string; course_id: string; course_title: string; concept_id: string; concept_title: string; due_at: Date }[]>`
    select r.id, r.course_id, co.title as course_title, r.concept_id, c.title as concept_title, r.due_at
    from review_items r join courses co on co.id = r.course_id join concepts c on c.id = r.concept_id
    where r.owner_id = ${ownerId} and r.status = 'active' and co.status <> 'archived'
      and r.due_at <= now() + ${includeUpcoming ? "7 days" : "0 days"}::interval
    order by r.due_at limit 100`;
  const now = new Date();
  const map = (r: (typeof rows)[number]): DueReview => ({
    id: r.id,
    courseId: r.course_id,
    courseTitle: r.course_title,
    conceptId: r.concept_id,
    conceptTitle: r.concept_title,
    dueAt: r.due_at.toISOString(),
    dueLabel: r.due_at <= now ? "Due now" : formatInZone(r.due_at, timezone),
    overdue: r.due_at <= now,
  });
  return { due: rows.filter((r) => r.due_at <= now).map(map), upcoming: rows.filter((r) => r.due_at > now).map(map) };
}

export async function postponeReview(ownerId: string, reviewId: string, days: number) {
  return tx(async (t) => {
    const [r] = await t<{ id: string; due_at: Date }[]>`select id, due_at from review_items where id = ${reviewId} and owner_id = ${ownerId} and status = 'active' for update`;
    if (!r) throw notFound("Review");
    const due = postpone(r.due_at, days, new Date());
    await t`update review_items set due_at = ${due} where id = ${r.id}`;
    return { id: r.id, dueAt: due.toISOString() };
  });
}

export type Preferences = {
  displayName: string | null;
  email: string | null;
  isGuest: boolean;
  timezone: string;
  remindersEnabled: boolean;
  emailOptIn: boolean;
  /** The address was confirmed by following an emailed link; reminders are only sent to confirmed addresses. */
  emailVerified: boolean;
  /** Whether this deployment can send email at all. */
  emailAvailable: boolean;
  quietHours: { start: string; end: string };
};

export async function getPreferences(ownerId: string): Promise<Preferences> {
  const [r] = await db()<{ email: string | null; is_guest: boolean; verified: boolean; display_name: string | null; timezone: string; reminders_enabled: boolean; email_opt_in: boolean; quiet_hours_json: { start: string; end: string } }[]>`
    select u.email, u.is_guest, u.email_verified_at is not null as verified, p.display_name, p.timezone, pr.reminders_enabled, pr.email_opt_in, pr.quiet_hours_json
    from users u join profiles p on p.user_id = u.id join user_preferences pr on pr.owner_id = u.id where u.id = ${ownerId}`;
  if (!r) throw notFound("Profile");
  return { email: r.email, isGuest: r.is_guest, displayName: r.display_name, timezone: r.timezone, remindersEnabled: r.reminders_enabled, emailOptIn: r.email_opt_in, emailVerified: r.verified, emailAvailable: emailEnabled(), quietHours: r.quiet_hours_json };
}

export async function updatePreferences(ownerId: string, p: Partial<Pick<Preferences, "displayName" | "timezone" | "remindersEnabled" | "emailOptIn" | "quietHours">>) {
  const before = await getPreferences(ownerId);
  await tx(async (t) => {
    if (p.displayName !== undefined || p.timezone !== undefined) {
      const [cur] = await t<{ display_name: string | null; timezone: string }[]>`select display_name, timezone from profiles where user_id = ${ownerId} for update`;
      await t`update profiles set display_name = ${p.displayName === undefined ? cur.display_name : p.displayName}, timezone = ${p.timezone ? safeZone(p.timezone) : cur.timezone} where user_id = ${ownerId}`;
    }
    const [cur] = await t<{ reminders_enabled: boolean; email_opt_in: boolean; quiet_hours_json: object }[]>`select * from user_preferences where owner_id = ${ownerId} for update`;
    const reminders = p.remindersEnabled ?? cur.reminders_enabled;
    // Email delivery requires reminders to be on; turning reminders off withdraws email consent too.
    // Guests have no address to send to.
    const email = reminders && !before.isGuest ? (p.emailOptIn ?? cur.email_opt_in) : false;
    await t`update user_preferences set reminders_enabled = ${reminders}, email_opt_in = ${email}, quiet_hours_json = ${json(p.quietHours ?? cur.quiet_hours_json)} where owner_id = ${ownerId}`;
  });
  const after = await getPreferences(ownerId);
  // Newly opted in to email with an unconfirmed address: ask them to confirm it.
  if (after.emailOptIn && !before.emailOptIn && !after.emailVerified) await sendVerification(ownerId);
  return after;
}

/** Full export of the learner's own data (JSON). */
export async function exportAccount(ownerId: string) {
  const q = db();
  const [profile] = await q`select u.email, u.created_at, p.display_name, p.timezone from users u join profiles p on p.user_id = u.id where u.id = ${ownerId}`;
  const courses = await q`select * from courses where owner_id = ${ownerId}`;
  const ids = courses.map((c) => c.id as string);
  const inCourses = <T extends string>(table: T) => (ids.length ? q`select * from ${q(table)} where course_id in ${q(ids)}` : Promise.resolve([]));
  return {
    exportedAt: new Date().toISOString(),
    profile,
    preferences: (await q`select * from user_preferences where owner_id = ${ownerId}`)[0],
    drafts: await q`select id, topic, status, state_json, proposal_json, created_at from course_drafts where owner_id = ${ownerId}`,
    courses,
    goalVersions: await inCourses("course_goal_versions"),
    concepts: await inCourses("concepts"),
    conceptEdges: await inCourses("concept_edges"),
    curriculumVersions: await inCourses("course_curriculum_versions"),
    sessions: await q`select * from sessions where owner_id = ${ownerId}`,
    activities: await inCourses("activities"),
    attempts: await q`select * from attempts where owner_id = ${ownerId}`,
    evidence: await inCourses("assessment_evidence"),
    mastery: await inCourses("mastery_estimates"),
    reviews: await q`select * from review_items where owner_id = ${ownerId}`,
  };
}

/** Permanently deletes the account and all learner data (cascades). Requires typing the account email. */
export async function deleteAccount(ownerId: string, confirmEmail: string) {
  const [u] = await db()<{ email: string | null; is_guest: boolean }[]>`select email, is_guest from users where id = ${ownerId}`;
  if (!u) throw notFound("Account");
  // Guests have no email; they confirm by typing "delete".
  const expected = u.is_guest ? "delete" : (u.email ?? "").toLowerCase();
  if (expected !== confirmEmail.trim().toLowerCase()) {
    throw new AppError("validation_failed", u.is_guest ? 'Type "delete" to confirm.' : "Type your account email to confirm deletion.");
  }
  await db()`delete from users where id = ${ownerId}`;
}
