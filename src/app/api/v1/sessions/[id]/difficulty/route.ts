import { route, ok } from "@/lib/api/handler";
import { DifficultyBody } from "@/lib/schemas/api";
import { setDifficulty } from "@/lib/services/sessions";

export const POST = route(async ({ user, params, body }) => ok({ session: await setDifficulty(user.id, params.id, body.offset) }), { body: DifficultyBody });
