import { route, ok } from "@/lib/api/handler";
import { BranchBody } from "@/lib/schemas/api";
import { addBranch } from "@/lib/services/courses";

export const POST = route(async ({ user, params, body }) => ok(await addBranch(user.id, params.id, body.question), { status: 201 }), { body: BranchBody });
