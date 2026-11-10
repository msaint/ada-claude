import { publicRoute, ok } from "@/lib/api/handler";
import { PasswordResetConfirmBody } from "@/lib/schemas/api";
import { createSession, mergeGuestInto, sessionCookie } from "@/lib/auth/session";
import { confirmPasswordReset } from "@/lib/services/email";

/** Sets the new password, signs out every other device, and signs this one in. */
export const POST = publicRoute(
  async ({ body, user }) => {
    const userId = await confirmPasswordReset(body.token, body.password);
    if (user?.isGuest) await mergeGuestInto(user.id, userId);
    const s = await createSession(userId);
    return ok({ ok: true }, { headers: { "set-cookie": sessionCookie(s.token, s.expiresAt) } });
  },
  { body: PasswordResetConfirmBody },
);
