import { cronAuthorized, cronDenied } from "@/lib/api/cron";
import { sendDueReminders } from "@/lib/services/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sends review reminder emails. Called hourly by the GitHub Actions
 * "Review reminders" workflow with `Authorization: Bearer <CRON_SECRET>`.
 * Safe to call at any frequency: each learner gets at most one a day.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return cronDenied();
  return Response.json({ ok: true, ...(await sendDueReminders()) });
}
