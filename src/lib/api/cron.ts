import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** True when the request carries `Authorization: Bearer <CRON_SECRET>`. Always false if no secret is configured. */
export function cronAuthorized(req: Request): boolean {
  const secret = env().CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  return !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export const cronDenied = () => Response.json({ error: { code: "unauthenticated", message: "Not allowed.", retryable: false } }, { status: 401 });
