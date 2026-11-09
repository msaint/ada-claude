import { createHash, randomBytes } from "node:crypto";
import { db, type Tx } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";

export const SESSION_COOKIE = "ada_session";
const SESSION_DAYS = 30;
/** Guest progress lives only on the device, for this long without an account. */
export const GUEST_DAYS = 14;

export type AuthUser = { id: string; email: string | null; displayName: string | null; timezone: string; isGuest: boolean };
type UserRow = { id: string; email: string | null; display_name: string | null; timezone: string | null; is_guest: boolean };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const toUser = (r: UserRow): AuthUser => ({ id: r.id, email: r.email, displayName: r.display_name, timezone: r.timezone ?? "UTC", isGuest: r.is_guest });

async function insertProfile(t: Tx, userId: string, tz: string) {
  await t`insert into profiles (user_id, timezone) values (${userId}, ${tz})`;
  await t`insert into user_preferences (owner_id) values (${userId})`; // reminders default OFF
}

export async function createUser(email: string, password: string, timezone = "UTC"): Promise<AuthUser> {
  const normalized = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  const tz = safeZone(timezone);
  try {
    return await db().begin(async (t) => {
      const [u] = await t<{ id: string; email: string }[]>`insert into users (email, password_hash) values (${normalized}, ${passwordHash}) returning id, email`;
      await insertProfile(t, u.id, tz);
      return { id: u.id, email: u.email, displayName: null, timezone: tz, isGuest: false };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new AppError("conflict", "An account with that email already exists.");
    throw e;
  }
}

/** Hash of the client IP (truncated), used only to rate-limit guest creation. */
export function ipHash(ip: string | null): string | null {
  return ip ? sha256(`ada-guest:${ip}`).slice(0, 32) : null;
}

/** Removes guests whose sessions have all expired (their data goes with them via cascades). */
export async function purgeStaleGuests() {
  await db()`delete from auth_sessions where expires_at < now() - interval '1 day'`;
  await db()`
    delete from users u where u.id in (
      select id from users g where g.is_guest and g.created_at < now() - interval '1 day'
        and not exists (select 1 from auth_sessions s where s.user_id = g.id and s.expires_at > now())
      limit 200)`;
}

export async function createGuest(opts: { ipHash: string | null; timezone?: string; maxPerHourPerIp: number }): Promise<AuthUser> {
  if (opts.ipHash) {
    const [{ n }] = await db()<{ n: number }[]>`
      select count(*)::int as n from users where is_guest and guest_ip_hash = ${opts.ipHash} and created_at > now() - interval '1 hour'`;
    if (n >= opts.maxPerHourPerIp) throw new AppError("rate_limited", "Too many new visits from this network. Try again later, or create an account.", true);
  }
  await purgeStaleGuests().catch(() => {});
  const tz = safeZone(opts.timezone ?? "UTC");
  return db().begin(async (t) => {
    const [u] = await t<{ id: string }[]>`insert into users (is_guest, guest_ip_hash) values (true, ${opts.ipHash}) returning id`;
    await insertProfile(t, u.id, tz);
    return { id: u.id, email: null, displayName: null, timezone: tz, isGuest: true };
  });
}

/** Turns the current guest into a full account, keeping every course, answer and review. */
export async function upgradeGuest(guestId: string, email: string, password: string): Promise<AuthUser> {
  const normalized = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  try {
    const [u] = await db()<UserRow[]>`
      update users set email = ${normalized}, password_hash = ${passwordHash}, is_guest = false, guest_ip_hash = null
      where id = ${guestId} and is_guest returning id, email, is_guest, null::text as display_name, null::text as timezone`;
    if (!u) throw new AppError("conflict", "This guest session was already converted.");
    await db()`update auth_sessions set expires_at = now() + ${`${SESSION_DAYS} days`}::interval where user_id = ${guestId}`;
    return (await getUserById(guestId))!;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new AppError("conflict", "An account with that email already exists. Sign in instead — your guest course will be added to it.");
    throw e;
  }
}

/** Moves everything a guest owns into an existing account, then deletes the guest. */
export async function mergeGuestInto(guestId: string, userId: string) {
  if (guestId === userId) return;
  await db().begin(async (t) => {
    const [g] = await t<{ id: string }[]>`select id from users where id = ${guestId} and is_guest for update`;
    if (!g) return;
    for (const table of ["course_drafts", "courses", "sessions", "activity_drafts", "attempts", "review_items", "notification_log", "model_usage", "telemetry_events"]) {
      await t`update ${t(table)} set owner_id = ${userId} where owner_id = ${guestId}`;
    }
    await t`delete from users where id = ${guestId}`;
  });
}

export async function authenticate(email: string, password: string): Promise<AuthUser> {
  const [u] = await db()<{ id: string; password_hash: string | null }[]>`select id, password_hash from users where email = ${email.trim().toLowerCase()} and not is_guest`;
  // Always run a hash comparison to reduce timing differences for unknown emails.
  const ok = await verifyPassword(password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !ok) throw new AppError("unauthenticated", "Email or password is incorrect.");
  return (await getUserById(u.id))!;
}

export async function createSession(userId: string, days = SESSION_DAYS): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + days * 864e5);
  await db()`insert into auth_sessions (user_id, token_hash, expires_at) values (${userId}, ${sha256(token)}, ${expiresAt})`;
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  await db()`delete from auth_sessions where token_hash = ${sha256(token)}`;
}

export async function getUserBySessionToken(token: string | undefined | null): Promise<AuthUser | null> {
  if (!token || token.length > 200) return null;
  const [row] = await db()<UserRow[]>`
    select u.id, u.email, u.is_guest, p.display_name, p.timezone
    from auth_sessions s join users u on u.id = s.user_id left join profiles p on p.user_id = u.id
    where s.token_hash = ${sha256(token)} and s.expires_at > now()`;
  return row ? toUser(row) : null;
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const [row] = await db()<UserRow[]>`
    select u.id, u.email, u.is_guest, p.display_name, p.timezone from users u left join profiles p on p.user_id = u.id where u.id = ${id}`;
  return row ? toUser(row) : null;
}

export function safeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz.slice(0, 64);
  } catch {
    return "UTC";
  }
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function sessionCookie(token: string, expiresAt: Date) {
  const secure = process.env.NODE_ENV === "production" && (process.env.APP_BASE_URL ?? "").startsWith("https://") ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** First client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || null;
}
