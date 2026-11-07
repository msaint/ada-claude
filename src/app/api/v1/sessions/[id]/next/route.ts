import { route, ok } from "@/lib/api/handler";
import { NextBody } from "@/lib/schemas/api";
import { advanceSession } from "@/lib/services/sessions";

export const POST = route(async ({ user, params, body }) => ok({ session: await advanceSession(user.id, params.id, body.fromActivityId) }), { body: NextBody });
