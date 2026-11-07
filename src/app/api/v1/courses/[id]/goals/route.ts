import { route, ok } from "@/lib/api/handler";
import { ReviseGoalBody } from "@/lib/schemas/api";
import { reviseGoal } from "@/lib/services/courses";

export const POST = route(async ({ user, params, body }) => ok(await reviseGoal(user.id, params.id, body), { status: 201 }), { body: ReviseGoalBody });
