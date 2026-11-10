import { publicRoute, ok } from "@/lib/api/handler";
import { EmailTokenBody } from "@/lib/schemas/api";
import { confirmEmail } from "@/lib/services/email";

export const POST = publicRoute(
  async ({ body }) => {
    await confirmEmail(body.token);
    return ok({ ok: true });
  },
  { body: EmailTokenBody },
);
