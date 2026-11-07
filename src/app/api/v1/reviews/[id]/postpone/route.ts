import { route, ok } from "@/lib/api/handler";
import { PostponeBody } from "@/lib/schemas/api";
import { postponeReview } from "@/lib/services/account";

export const POST = route(async ({ user, params, body }) => ok(await postponeReview(user.id, params.id, body.days)), { body: PostponeBody });
