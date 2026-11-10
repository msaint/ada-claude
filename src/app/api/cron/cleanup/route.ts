import { cleanupExpiredData } from "@/lib/auth/session";
import { cronAuthorized, cronDenied } from "@/lib/api/cron";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Daily housekeeping, called by Vercel Cron (see vercel.json), which sends
 * `Authorization: Bearer <CRON_SECRET>`. Without the secret configured, or
 * with a wrong one, nothing runs.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return cronDenied();
  const result = await cleanupExpiredData();
  log.info("cron_cleanup", result);
  return Response.json({ ok: true, ...result });
}
