import { route, ok } from "@/lib/api/handler";
import { AttemptBody } from "@/lib/schemas/api";
import { submitAttempt } from "@/lib/services/sessions";

export const POST = route(async ({ user, params, body }) => ok({ session: await submitAttempt(user.id, params.id, body.idempotencyKey, body.response) }), {
  body: AttemptBody,
});
