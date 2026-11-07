import { route, ok } from "@/lib/api/handler";
import { AssistBody } from "@/lib/schemas/api";
import { requestHint } from "@/lib/services/sessions";

export const POST = route(async ({ user, params, body }) => ok(await requestHint(user.id, params.id, body.idempotencyKey)), { body: AssistBody });
