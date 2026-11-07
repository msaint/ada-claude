import { publicRoute, ok } from "@/lib/api/handler";
import { SignUpBody } from "@/lib/schemas/api";
import { createSession, createUser, sessionCookie } from "@/lib/auth/session";

export const POST = publicRoute(
  async ({ body }) => {
    const user = await createUser(body.email, body.password, body.timezone);
    const s = await createSession(user.id);
    return ok({ user: { id: user.id, email: user.email } }, { status: 201, headers: { "set-cookie": sessionCookie(s.token, s.expiresAt) } });
  },
  { body: SignUpBody },
);
