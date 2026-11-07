import { randomUUID } from "node:crypto";
import { createSession, createUser } from "@/lib/auth/session";

/** Calls Next.js route handlers in-process with a real session cookie (no HTTP server needed). */
export type TestUser = { id: string; email: string; cookie: string };

export async function makeUser(): Promise<TestUser> {
  const email = `u-${randomUUID().slice(0, 8)}@example.test`;
  const u = await createUser(email, "correct horse battery", "America/New_York");
  const s = await createSession(u.id);
  return { id: u.id, email, cookie: `ada_session=${s.token}` };
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export async function call(
  handler: Handler,
  opts: { user?: TestUser | null; method?: string; params?: Record<string, string>; body?: unknown; headers?: Record<string, string>; url?: string } = {},
) {
  const headers: Record<string, string> = { host: "localhost:3000", ...(opts.headers ?? {}) };
  if (opts.user) headers.cookie = opts.user.cookie;
  if (opts.body !== undefined) headers["content-type"] = headers["content-type"] ?? "application/json";
  const req = new Request(opts.url ?? "http://localhost:3000/api/v1/test", {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers };
}

export const key = () => randomUUID();
