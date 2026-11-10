import { publicRoute, ok } from "@/lib/api/handler";
import { PasswordResetRequestBody } from "@/lib/schemas/api";
import { assertSignInAllowed, clientIp, recordSignInAttempt } from "@/lib/auth/session";
import { runAfterResponse } from "@/lib/background";
import { requestPasswordReset } from "@/lib/services/email";

/** Always answers the same way, whether or not the address has an account. */
export const POST = publicRoute(
  async ({ req, body }) => {
    // Share the sign-in throttle so this can't be used to flood an inbox or probe a network's worth of addresses.
    const ip = clientIp(req);
    await assertSignInAllowed(body.email, ip);
    await recordSignInAttempt(body.email, ip, false);
    // Sent after the response so timing doesn't reveal whether the account exists.
    await runAfterResponse("password_reset_email", () => requestPasswordReset(body.email));
    return ok({ ok: true });
  },
  { body: PasswordResetRequestBody },
);
