import { route, ok } from "@/lib/api/handler";
import { CreateDraftBody } from "@/lib/schemas/api";
import { createDraft } from "@/lib/services/drafts";

export const POST = route(async ({ user, body }) => ok({ draft: await createDraft(user.id, body.topic, body.idempotencyKey) }, { status: 201 }), {
  body: CreateDraftBody,
});
