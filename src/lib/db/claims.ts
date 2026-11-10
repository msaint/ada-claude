import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `fn` while holding a short-lived claim on `resource`, waiting (by
 * polling, with no connection held) if another request holds it. Use this
 * around model calls instead of a row lock, so no database connection is
 * held while the model runs.
 *
 * `fn` must be idempotent against the row's current state: after waiting, it
 * runs normally and should find the other request's work already applied.
 * If the holder outlives `ttlMs`, the claim is taken over; the apply-step
 * state checks in `fn` keep that safe.
 */
export async function withClaim<T>(resource: string, fn: () => Promise<T>, opts: { ttlMs?: number; waitMs?: number } = {}): Promise<T> {
  const ttlMs = opts.ttlMs ?? 150_000;
  const waitMs = opts.waitMs ?? 90_000;
  const token = randomUUID();
  const started = Date.now();
  let delay = 100;
  for (;;) {
    const got = await db()`
      insert into work_claims (resource, token, expires_at) values (${resource}, ${token}, now() + ${`${ttlMs} milliseconds`}::interval)
      on conflict (resource) do update set token = excluded.token, expires_at = excluded.expires_at, created_at = now()
      where work_claims.expires_at < now()
      returning token`;
    if (got.length) break;
    if (Date.now() - started > waitMs) throw new AppError("conflict", "Ada is still working on this. Try again in a moment.", true);
    await sleep(delay);
    delay = Math.min(1000, Math.round(delay * 1.5));
  }
  try {
    return await fn();
  } finally {
    await db()`delete from work_claims where resource = ${resource} and token = ${token}`.catch(() => {});
  }
}
