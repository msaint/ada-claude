import { publicRoute, ok } from "@/lib/api/handler";
import { SignUpBody } from "@/lib/schemas/api";
import { createSession, createUser, sessionCookie, upgradeGuest } from "@/lib/auth/session";

/** Creates an account. If the visitor is a guest, the guest is upgraded in place so their course is kept. */
export const POST = publicRoute(
  async ({ body, user }) => {
    if (user && !user.isGuest) return ok({ user: { id: user.id, email: user.email } });
    const account = user?.isGuest ? await upgradeGuest(user.id, body.email, body.password) : await createUser(body.email, body.password, body.timezone);
    const s = await createSession(account.id);
    return ok({ user: { id: account.id, email: account.email }, keptGuestData: !!user?.isGuest }, { status: 201, headers: { "set-cookie": sessionCookie(s.token, s.expiresAt) } });
  },
  { body: SignUpBody },
);
