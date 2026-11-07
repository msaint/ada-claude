import { route, ok } from "@/lib/api/handler";
import { DraftInputBody } from "@/lib/schemas/api";
import { saveActivityDraft } from "@/lib/services/sessions";

export const PUT = route(async ({ user, params, body }) => ok(await saveActivityDraft(user.id, params.id, body.draft, body.baseVersion)), { body: DraftInputBody });
