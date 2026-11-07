import { route, ok } from "@/lib/api/handler";
import { DeleteAccountBody } from "@/lib/schemas/api";
import { clearSessionCookie } from "@/lib/auth/session";
import { deleteAccount } from "@/lib/services/account";

export const DELETE = route(
  async ({ user, body }) => {
    await deleteAccount(user.id, body.confirmEmail);
    return ok({ deleted: true }, { headers: { "set-cookie": clearSessionCookie() } });
  },
  { body: DeleteAccountBody },
);
