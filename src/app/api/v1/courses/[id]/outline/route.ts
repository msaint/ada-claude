import { route, ok } from "@/lib/api/handler";
import { getOutline } from "@/lib/services/courses";

export const GET = route(async ({ user, params }) => ok({ outline: await getOutline(user.id, params.id) }));
