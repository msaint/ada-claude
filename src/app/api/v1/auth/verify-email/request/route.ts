import { route, ok } from "@/lib/api/handler";
import { sendVerification } from "@/lib/services/email";

/** Re-sends the "confirm your email" message to the signed-in account (limited per hour). */
export const POST = route(async ({ user }) => ok({ sent: await sendVerification(user.id) }));
