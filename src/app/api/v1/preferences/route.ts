import { route, ok } from "@/lib/api/handler";
import { PreferencesBody } from "@/lib/schemas/api";
import { getPreferences, updatePreferences } from "@/lib/services/account";

export const GET = route(async ({ user }) => ok({ preferences: await getPreferences(user.id) }));
export const PATCH = route(async ({ user, body }) => ok({ preferences: await updatePreferences(user.id, body) }), { body: PreferencesBody });
