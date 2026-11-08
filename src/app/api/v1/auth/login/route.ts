import { publicRoute, ok } from "@/lib/api/handler";
import { SignInBody } from "@/lib/schemas/api";
import { authenticate, createSession, destroySession, mergeGuestInto, readCookie, SESSION_COOKIE, sessionCookie } from "@/lib/auth/session";

/** Signs in. A guest's course (if any) moves into the account being signed into. */
export const POST = publicRoute(
  async ({ req, body, user }) => {
    const account = await authenticate(body.email, body.password);
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
