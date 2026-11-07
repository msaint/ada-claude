import { route, ok } from "@/lib/api/handler";

export const GET = route(async ({ user }) => ok({ user: { id: user.id, email: user.email, displayName: user.displayName, timezone: user.timezone } }));
