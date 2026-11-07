import { publicRoute, ok } from "@/lib/api/handler";
import { SignInBody } from "@/lib/schemas/api";
import { authenticate, createSession, sessionCookie } from "@/lib/auth/session";

export const POST = publicRoute(
  async ({ body }) => {
    const user = await authenticate(body.email, body.password);
    const s = await createSession(user.id);
    return ok({ user: { id: user.id, email: user.email } }, { headers: { "set-cookie": sessionCookie(s.token, s.expiresAt) } });
  },
  { body: SignInBody },
);
