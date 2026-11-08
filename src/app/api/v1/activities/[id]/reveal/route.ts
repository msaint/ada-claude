import { route, ok } from "@/lib/api/handler";
import { revealAnswer } from "@/lib/services/sessions";

export const POST = route(async ({ user, params }) => ok({ session: await revealAnswer(user.id, params.id) }));
