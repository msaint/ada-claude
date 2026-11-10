import { publicRoute, ok } from "@/lib/api/handler";
import { SignInBody } from "@/lib/schemas/api";
import {
  assertSignInAllowed,
  authenticate,
  clientIp,
  createSession,
  destroySession,
  mergeGuestInto,
  readCookie,
  recordSignInAttempt,
  SESSION_COOKIE,
  sessionCookie,
} from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

/** Signs in. A guest's course (if any) moves into the account being signed into. */
export const POST = publicRoute(
  async ({ req, body, user }) => {
    const ip = clientIp(req);
    await assertSignInAllowed(body.email, ip);
    const account = await authenticate(body.email, body.password).catch(async (e) => {
      if (e instanceof AppError && e.code === "unauthenticated") await recordSignInAttempt(body.email, ip, false);
      throw e;
    });
    await recordSignInAttempt(body.email, ip, true);
    if (user?.isGuest) {
      await mergeGuestInto(user.id, account.id);
    } else if (user) {
      const old = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
      if (old) await destroySession(old);
    }
    const s = await createSession(account.id);
    return ok({ user: { id: account.id, email: account.email }, mergedGuestData: !!user?.isGuest }, { headers: { "set-cookie": sessionCookie(s.token, s.expiresAt) } });
  },
  { body: SignInBody },
);
