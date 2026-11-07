import { publicRoute, ok } from "@/lib/api/handler";
import { clearSessionCookie, destroySession, readCookie, SESSION_COOKIE } from "@/lib/auth/session";

export const POST = publicRoute(async ({ req }) => {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (token) await destroySession(token);
  return ok({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
});
