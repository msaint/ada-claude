import { route, ok } from "@/lib/api/handler";
import { ConvertDraftBody } from "@/lib/schemas/api";
import { convertDraft } from "@/lib/services/drafts";

export const POST = route(
  async ({ user, params }) => {
    const r = await convertDraft(user.id, params.id);
    return ok(r, { status: r.created ? 201 : 200 });
  },
  { body: ConvertDraftBody },
);
