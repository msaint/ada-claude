import { route, ok } from "@/lib/api/handler";
import { BackgroundDraftBody } from "@/lib/schemas/api";
import { setDraftBackground } from "@/lib/services/drafts";

export const POST = route(async ({ user, params, body }) => ok({ draft: await setDraftBackground(user.id, params.id, body) }), { body: BackgroundDraftBody });
