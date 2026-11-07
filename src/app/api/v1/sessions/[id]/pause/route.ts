import { route, ok } from "@/lib/api/handler";
import { pauseSession } from "@/lib/services/sessions";

export const POST = route(async ({ user, params }) => ok({ session: await pauseSession(user.id, params.id) }));
