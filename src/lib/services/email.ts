import { createHash, randomBytes } from "node:crypto";
import { db, json } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { hashPassword } from "@/lib/auth/password";
import { button, emailEnabled, escapeHtml, layout, sendEmail } from "@/lib/email/mailer";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const baseUrl = () => env().APP_BASE_URL.replace(/\/+$/, "");

const RESET_MINUTES = 60;
const VERIFY_HOURS = 48;
/** Emails of one kind that one account can trigger per hour. */
const MAX_TOKENS_PER_HOUR = 3;
/** Don't nudge someone who has just been studying. */
const RECENT_ACTIVITY_HOURS = 2;

type Purpose = "reset" | "verify";

/** Creates a single-use token (only its hash is stored). Returns null when the hourly limit is reached. */
async function issueToken(userId: string, purpose: Purpose, ttlMinutes: number): Promise<string | null> {
  const [{ n }] = await db()<{ n: number }[]>`
    select count(*)::int as n from email_tokens where user_id = ${userId} and purpose = ${purpose} and created_at > now() - interval '1 hour'`;
  if (n >= MAX_TOKENS_PER_HOUR) return null;
  const token = randomBytes(32).toString("base64url");
  await db()`
    insert into email_tokens (user_id, purpose, token_hash, expires_at)
    values (${userId}, ${purpose}, ${sha256(token)}, now() + ${`${ttlMinutes} minutes`}::interval)`;
  return token;
}

// ---------------------------------------------------------------- password reset

/**
 * Emails a reset link if the address belongs to an account. Never reveals
 * whether it does: callers always answer the same way.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!emailEnabled()) return;
  const [u] = await db()<{ id: string; email: string }[]>`select id, email from users where email = ${email.trim().toLowerCase()} and not is_guest`;
  if (!u) return;
  const token = await issueToken(u.id, "reset", RESET_MINUTES);
  if (!token) return;
  const link = `${baseUrl()}/reset-password?token=${token}`;
  await sendEmail({
    to: u.email,
    subject: "Reset your Ada password",
    text: `Someone asked to reset the password for your Ada account.\n\nChoose a new password (link works for ${RESET_MINUTES} minutes):\n${link}\n\nIf this wasn't you, ignore this email. Your password stays the same.`,
    html: layout(
      `<p>Someone asked to reset the password for your Ada account.</p>${button(link, "Choose a new password")}<p>The link works for ${RESET_MINUTES} minutes and can be used once.</p>`,
      "If this wasn't you, ignore this email. Your password stays the same.",
    ),
  });
}

/** Sets a new password from a reset token, signs out every existing session, and returns the account id. */
export async function confirmPasswordReset(token: string, password: string): Promise<string> {
  const passwordHash = await hashPassword(password);
  return db().begin(async (t) => {
    const [row] = await t<{ id: string; user_id: string }[]>`
      select id, user_id from email_tokens
      where token_hash = ${sha256(token)} and purpose = 'reset' and used_at is null and expires_at > now() for update`;
    if (!row) throw new AppError("validation_failed", "This reset link has expired or was already used. Ask for a new one.");
    // Following the link proves the address is theirs.
    await t`update users set password_hash = ${passwordHash}, email_verified_at = coalesce(email_verified_at, now()) where id = ${row.user_id}`;
    await t`update email_tokens set used_at = now() where user_id = ${row.user_id} and purpose = 'reset' and used_at is null`;
    await t`delete from auth_sessions where user_id = ${row.user_id}`;
    return row.user_id;
  });
}

// ---------------------------------------------------------------- email confirmation

/** Sends a "confirm your address" email. Returns false when rate-limited, already confirmed or email is off. */
export async function sendVerification(userId: string): Promise<boolean> {
  if (!emailEnabled()) return false;
  const [u] = await db()<{ email: string | null; verified: boolean }[]>`
    select email, email_verified_at is not null as verified from users where id = ${userId} and not is_guest`;
  if (!u?.email || u.verified) return false;
  const token = await issueToken(userId, "verify", VERIFY_HOURS * 60);
  if (!token) return false;
  const link = `${baseUrl()}/verify-email?token=${token}`;
  return sendEmail({
    to: u.email,
    subject: "Confirm your email for Ada reminders",
    text: `You turned on email reminders in Ada. Confirm this address to start receiving them:\n${link}\n\nIf this wasn't you, ignore this email and nothing will be sent.`,
    html: layout(
      `<p>You turned on email reminders in Ada. Confirm this address to start receiving them.</p>${button(link, "Confirm email")}`,
      "If this wasn't you, ignore this email and nothing will be sent.",
    ),
  });
}

export async function confirmEmail(token: string): Promise<void> {
  await db().begin(async (t) => {
    const [row] = await t<{ id: string; user_id: string }[]>`
      select id, user_id from email_tokens
      where token_hash = ${sha256(token)} and purpose = 'verify' and used_at is null and expires_at > now() for update`;
    if (!row) throw new AppError("validation_failed", "This confirmation link has expired or was already used. Ask for a new one in Settings.");
    await t`update users set email_verified_at = coalesce(email_verified_at, now()) where id = ${row.user_id}`;
    await t`update email_tokens set used_at = now() where user_id = ${row.user_id} and purpose = 'verify' and used_at is null`;
  });
}

// ---------------------------------------------------------------- unsubscribe

/** Turns email reminders off for the owner of this unsubscribe token. Unknown tokens are ignored. */
export async function unsubscribe(token: string): Promise<void> {
  if (!token || token.length > 100) return;
  await db()`update user_preferences set email_opt_in = false where unsubscribe_token = ${token}`;
}

// ---------------------------------------------------------------- review reminders

type Candidate = {
  id: string;
  email: string;
  timezone: string;
  quiet_hours_json: { start: string; end: string };
  daily_nudge_limit: number;
  weekly_nudge_limit: number;
  unsubscribe_token: string;
  sent_week: number;
};

/** Local date (YYYY-MM-DD) and time (HH:MM) in a time zone. */
export function localParts(now: Date, timeZone: string): { date: string; time: string } {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = fmt(timeZone);
  } catch {
    parts = fmt("UTC");
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** True when `time` (HH:MM) falls inside the quiet window, which may wrap past midnight. */
export function inQuietHours(time: string, quiet: { start: string; end: string }): boolean {
  const { start, end } = quiet;
  if (start === end) return false;
  return start < end ? time >= start && time < end : time >= start || time < end;
}

/**
 * Sends at most one review reminder per learner per local day. Safe to call as
 * often as you like (hourly is intended): every send is claimed in
 * notification_log first, so overlapping or repeated runs cannot double-send.
 *
 * A learner gets an email only if they opted in to reminders and to email,
 * confirmed their address, have a review due, are outside their quiet hours,
 * haven't studied in the last couple of hours, and are under their weekly limit.
 */
export async function sendDueReminders(now = new Date()): Promise<{ candidates: number; sent: number; skipped: number; failed: number }> {
  const result = { candidates: 0, sent: 0, skipped: 0, failed: 0 };
  if (!emailEnabled()) return result;
  const candidates = await db()<Candidate[]>`
    select u.id, u.email, p.timezone, pr.quiet_hours_json, pr.daily_nudge_limit, pr.weekly_nudge_limit, pr.unsubscribe_token,
      (select count(*)::int from notification_log n where n.owner_id = u.id and n.channel = 'email' and n.created_at > ${now}::timestamptz - interval '7 days') as sent_week
    from users u
    join profiles p on p.user_id = u.id
    join user_preferences pr on pr.owner_id = u.id
    where not u.is_guest and u.email is not null and u.email_verified_at is not null
      and pr.reminders_enabled and pr.email_opt_in and pr.daily_nudge_limit > 0
      and exists (
        select 1 from review_items r join courses co on co.id = r.course_id
        where r.owner_id = u.id and r.status = 'active' and r.due_at <= ${now} and co.status <> 'archived')
      and not exists (
        select 1 from attempts a where a.owner_id = u.id and a.submitted_at > ${now}::timestamptz - ${`${RECENT_ACTIVITY_HOURS} hours`}::interval)
    limit 500`;
  result.candidates = candidates.length;

  for (const c of candidates) {
    const local = localParts(now, c.timezone);
    if (inQuietHours(local.time, c.quiet_hours_json) || c.sent_week >= c.weekly_nudge_limit) {
      result.skipped++;
      continue;
    }
    const key = `review-email:${local.date}`;
    const [claim] = await db()<{ id: string }[]>`
      insert into notification_log (owner_id, channel, status, idempotency_key)
      values (${c.id}, 'email', 'sending', ${key}) on conflict (owner_id, idempotency_key) do nothing returning id`;
    if (!claim) {
      result.skipped++; // already reminded today
      continue;
    }
    const due = await db()<{ concept: string; course: string }[]>`
      select c.title as concept, co.title as course
      from review_items r join courses co on co.id = r.course_id join concepts c on c.id = r.concept_id
      where r.owner_id = ${c.id} and r.status = 'active' and r.due_at <= ${now} and co.status <> 'archived'
      order by r.due_at limit 50`;
    const ok = due.length > 0 && (await sendEmail(reminderEmail(c, due)));
    if (ok) {
      await db()`update notification_log set status = 'sent', sent_at = now(), payload_json = ${json({ due: due.length })} where id = ${claim.id}`;
      result.sent++;
    } else {
      // Release the claim so a later run can try again today.
      await db()`delete from notification_log where id = ${claim.id}`;
      result.failed++;
    }
  }
  log.info("reminders_run", result);
  return result;
}

function reminderEmail(c: Candidate, due: { concept: string; course: string }[]) {
  const n = due.length;
  const shown = due.slice(0, 5);
  const more = n - shown.length;
  const reviewUrl = `${baseUrl()}/app/review`;
  const unsubPage = `${baseUrl()}/unsubscribe?token=${c.unsubscribe_token}`;
  const unsubPost = `${baseUrl()}/api/email/unsubscribe?token=${c.unsubscribe_token}`;
  const subject = n === 1 ? `Quick review: ${due[0].concept}`.slice(0, 120) : `${n} reviews are ready in Ada`;
  const intro = n === 1 ? "One idea is due for a quick review. A couple of minutes now keeps it from fading." : `${n} ideas are due for review. A few minutes now keeps them from fading.`;
  return {
    to: c.email,
    subject,
    text: `${intro}\n\n${shown.map((d) => `- ${d.concept} (${d.course})`).join("\n")}${more > 0 ? `\n…and ${more} more` : ""}\n\nReview now: ${reviewUrl}\n\nStop these emails: ${unsubPage}`,
    html: layout(
      `<p>${escapeHtml(intro)}</p><ul style="padding-left:20px">${shown
        .map((d) => `<li>${escapeHtml(d.concept)} <span style="color:#646870">· ${escapeHtml(d.course)}</span></li>`)
        .join("")}</ul>${more > 0 ? `<p style="color:#646870">…and ${more} more</p>` : ""}${button(reviewUrl, "Review now")}`,
      `You asked Ada to email you when reviews are due, at most once a day. <a href="${escapeHtml(unsubPage)}" style="color:#646870">Stop these emails</a>.`,
    ),
    headers: { "List-Unsubscribe": `<${unsubPost}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
