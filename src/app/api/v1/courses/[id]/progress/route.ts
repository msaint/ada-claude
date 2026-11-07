import { route, ok } from "@/lib/api/handler";
import { getProgress } from "@/lib/services/courses";

export const GET = route(async ({ user, params }) => ok({ progress: await getProgress(user.id, params.id, user.timezone) }));
