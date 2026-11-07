import { route, ok } from "@/lib/api/handler";
import { dueReviews } from "@/lib/services/account";

export const GET = route(async ({ user, req }) => ok(await dueReviews(user.id, user.timezone, new URL(req.url).searchParams.get("upcoming") === "1")));
