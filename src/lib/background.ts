import { after } from "next/server";
import { log } from "@/lib/log";

/**
 * Runs work after the HTTP response is sent (Vercel keeps the function alive
 * via `after`/waitUntil). `ADA_PREFETCH=sync` runs it inline (tests, for
 * determinism); `off` disables it. Errors are logged, never thrown.
 */
export async function runAfterResponse(name: string, task: () => Promise<void>): Promise<void> {
  const mode = process.env.ADA_PREFETCH ?? "background";
  if (mode === "off") return;
  const safe = () => task().catch((e) => log.warn("background_task_failed", { name, error: (e as Error)?.message }));
  if (mode === "sync") return safe();
  try {
    after(safe);
  } catch {
    // Outside a request scope (scripts): fire and forget.
    void safe();
  }
}
