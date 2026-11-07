import { route, ok } from "@/lib/api/handler";
import { ProposeDraftBody } from "@/lib/schemas/api";
import { proposeDraft } from "@/lib/services/drafts";

export const POST = route(async ({ user, params, body }) => ok({ draft: await proposeDraft(user.id, params.id, body) }), { body: ProposeDraftBody });
