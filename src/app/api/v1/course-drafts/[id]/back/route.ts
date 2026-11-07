import { route, ok } from "@/lib/api/handler";
import { BackDraftBody } from "@/lib/schemas/api";
import { backDraft } from "@/lib/services/drafts";

export const POST = route(async ({ user, params, body }) => ok({ draft: await backDraft(user.id, params.id, body.expectedVersion) }), { body: BackDraftBody });
