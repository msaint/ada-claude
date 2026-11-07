import { route, ok } from "@/lib/api/handler";
import { AssistBody } from "@/lib/schemas/api";
import { requestExplanation } from "@/lib/services/sessions";

export const POST = route(async ({ user, params, body }) => ok(await requestExplanation(user.id, params.id, body.idempotencyKey)), { body: AssistBody });
