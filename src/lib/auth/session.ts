import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";

export const SESSION_COOKIE = "ada_session";
const SESSION_DAYS = 30;

export type AuthUser = { id: string; email: string; displayName: string | null; timezone: string };
type UserRow = { id: string; email: string; display_name: string | null; timezone: string | null };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const toUser = (r: UserRow): AuthUser => ({ id: r.id, email: r.email, displayName: r.display_name, timezone: r.timezone ?? "UTC" });

export async function createUser(email: string, password: string, timezone = "UTC"): Promise<AuthUser> {
  const normalized = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  const tz = safeZone(timezone);
  try {
    return await db().begin(async (t) => {
      const [u] = await t<{ id: string; email: string }[]>`insert into users (email, password_hash) values (${normalized}, ${passwordHash}) returning id, email`;
      await t`insert into profiles (user_id, timezone) values (${u.id}, ${tz})`;
      await t`insert into user_preferences (owner_id) values (${u.id})`; // reminders default OFF
      return { id: u.id, email: u.email, displayName: null, timezone: tz };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new AppError("conflict", "An account with that email already exists.");
    throw e;
  }
}

export async function authenticate(email: string, password: string): Promise<AuthUser> {
  const [u] = await db()<{ id: string; password_hash: string }[]>`select id, password_hash from users where email = ${email.trim().toLowerCase()}`;
  // Always run a hash comparison to reduce timing differences for unknown emails.
  const ok = await verifyPassword(password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !ok) throw new AppError("unauthenticated", "Email or password is incorrect.");
  return (await getUserById(u.id))!;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db()`insert into auth_sessions (user_id, token_hash, expires_at) values (${userId}, ${sha256(token)}, ${expiresAt})`;
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  await db()`delete from auth_sessions where token_hash = ${sha256(token)}`;
}

export async function getUserBySessionToken(token: string | undefined | null): Promise<AuthUser | null> {
  if (!token || token.length > 200) return null;
  const [row] = await db()<UserRow[]>`
    select u.id, u.email, p.display_name, p.timezone
    from auth_sessions s join users u on u.id = s.user_id left join profiles p on p.user_id = u.id
    where s.token_hash = ${sha256(token)} and s.expires_at > now()`;
  return row ? toUser(row) : null;
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const [row] = await db()<UserRow[]>`
    select u.id, u.email, p.display_name, p.timezone from users u left join profiles p on p.user_id = u.id where u.id = ${id}`;
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
