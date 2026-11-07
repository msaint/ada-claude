import { route, ok } from "@/lib/api/handler";
import { StartSessionBody } from "@/lib/schemas/api";
import { startOrResumeSession } from "@/lib/services/sessions";

export const POST = route(async ({ user, params, body }) => ok({ session: await startOrResumeSession(user.id, params.id, body) }), { body: StartSessionBody });
