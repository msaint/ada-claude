import { publicRoute, ok } from "@/lib/api/handler";
import { GuestBody } from "@/lib/schemas/api";
import { clientIp, createGuest, createSession, GUEST_DAYS, ipHash, sessionCookie } from "@/lib/auth/session";
import { env } from "@/lib/env";

/** Starts a guest session so a visitor can create their first course without an account. Idempotent per browser. */
export const POST = publicRoute(
  async ({ req, user, body }) => {
    if (user) return ok({ user: { id: user.id, isGuest: user.isGuest } });
    const guest = await createGuest({ ipHash: ipHash(clientIp(req)), timezone: body.timezone, maxPerHourPerIp: env().ADA_GUEST_CREATIONS_PER_HOUR });
    const s = await createSession(guest.id, GUEST_DAYS);
    return ok({ user: { id: guest.id, isGuest: true } }, { status: 201, headers: { "set-cookie": sessionCookie(s.token, s.expiresAt) } });
  },
  { body: GuestBody },
);
