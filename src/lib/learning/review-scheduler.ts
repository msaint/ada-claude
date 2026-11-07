/**
 * P0 spaced-review policy: +1, +3, +7, +14, +30 days after independent
 * successful reviews. Incorrect resets; partial shortens; assistance
 * prevents the interval from expanding. Reading a reminder never counts.
 */

export const INTERVAL_LADDER = [1, 3, 7, 14, 30] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewState = { intervalDays: number; repetitions: number; dueAt: Date };
export type ReviewOutcome = {
  result: "correct" | "partial" | "incorrect" | "uncertain";
  independence: "independent" | "assisted";
};

export function initialReview(now: Date): ReviewState {
  return { intervalDays: 1, repetitions: 0, dueAt: addDays(now, 1) };
}

export function nextReview(prev: Pick<ReviewState, "intervalDays" | "repetitions">, outcome: ReviewOutcome, now: Date): ReviewState {
  let { intervalDays, repetitions } = prev;
  if (outcome.result === "incorrect") {
    repetitions = 0;
    intervalDays = 1;
  } else if (outcome.result === "partial" || outcome.result === "uncertain") {
    intervalDays = Math.max(1, Math.floor(intervalDays / 2));
  } else if (outcome.independence === "assisted") {
    // correct but assisted: keep the interval, don't expand
    intervalDays = Math.max(1, intervalDays);
  } else {
    repetitions += 1;
    intervalDays = INTERVAL_LADDER[Math.min(repetitions, INTERVAL_LADDER.length - 1)];
  }
  return { intervalDays, repetitions, dueAt: addDays(now, intervalDays) };
}

export function postpone(dueAt: Date, days: number, now: Date): Date {
  const base = dueAt.getTime() > now.getTime() ? dueAt : now;
  return addDays(base, Math.max(1, Math.min(days, 14)));
}

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Formats an absolute timestamp in the learner's time zone (storage is always UTC). */
export function formatInZone(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }).format(d);
  }
}
