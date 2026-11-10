import { timingSafeEqual } from "node:crypto";
import { cleanupExpiredData } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Daily housekeeping, called by Vercel Cron (see vercel.json), which sends
 * `Authorization: Bearer <CRON_SECRET>`. Without the secret configured, or
 * with a wrong one, nothing runs.
 */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return Response.json({ error: { code: "unauthenticated", message: "Not allowed.", retryable: false } }, { status: 401 });
  }
  const result = await cleanupExpiredData();
  log.info("cron_cleanup", result);
  return Response.json({ ok: true, ...result });
}
