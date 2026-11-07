import { route, ok } from "@/lib/api/handler";
import { getSessionView } from "@/lib/services/sessions";

export const GET = route(async ({ user, params }) => ok({ session: await getSessionView(user.id, params.id) }));
