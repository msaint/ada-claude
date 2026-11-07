import { route, ok } from "@/lib/api/handler";
import { AnswerDraftBody } from "@/lib/schemas/api";
import { answerDraft } from "@/lib/services/drafts";

export const POST = route(async ({ user, params, body }) => ok({ draft: await answerDraft(user.id, params.id, body) }), { body: AnswerDraftBody });
