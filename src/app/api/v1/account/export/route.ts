import { route, ok } from "@/lib/api/handler";
import { exportAccount } from "@/lib/services/account";

export const GET = route(async ({ user }) =>
  ok(await exportAccount(user.id), { headers: { "content-disposition": 'attachment; filename="ada-export.json"' } }),
);
