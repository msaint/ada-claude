import { route, ok } from "@/lib/api/handler";
import { getDraft } from "@/lib/services/drafts";

export const GET = route(async ({ user, params }) => ok({ draft: await getDraft(user.id, params.id) }));
