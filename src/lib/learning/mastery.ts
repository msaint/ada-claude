/**
 * Conservative P0 mastery policy. Status is *derived* from immutable evidence
 * and can be recomputed at any time; it is never a completion meter.
 */

export type EvidenceResult = "correct" | "partial" | "incorrect" | "uncertain" | "exposure";
export type Independence = "independent" | "assisted";

export type EvidenceRecord = {
  activityId: string;
  result: EvidenceResult;
  independence: Independence;
  difficulty: number | null;
  purpose: string; // e.g. prediction, check, apply, review, transfer
  createdAt: Date;
};

export type MasteryStatus = "not_assessed" | "developing" | "demonstrated";
export type DisplayStatus = MasteryStatus | "review_due";
export type Confidence = "none" | "low" | "provisional" | "consolidated";

export type MasteryEstimate = {
  status: MasteryStatus;
  confidence: Confidence;
  lastIndependentSuccessAt: Date | null;
  lastAssessedAt: Date | null;
  details: {
    assessments: number;
    independentSuccesses: number;
    assistedSuccesses: number;
    partials: number;
    incorrect: number;
    exposures: number;
    reason: string;
  };
};

const DAY = 24 * 60 * 60 * 1000;

export function computeMastery(evidence: EvidenceRecord[]): MasteryEstimate {
  const sorted = [...evidence].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const assessments = sorted.filter((e) => e.result !== "exposure");
  const exposures = sorted.length - assessments.length;
  const independentSuccesses = assessments.filter((e) => e.result === "correct" && e.independence === "independent");
  const assistedSuccesses = assessments.filter((e) => e.result === "correct" && e.independence === "assisted");
  const partials = assessments.filter((e) => e.result === "partial").length;
  const incorrect = assessments.filter((e) => e.result === "incorrect").length;
  const lastAssessedAt = assessments.at(-1)?.createdAt ?? null;
  const lastIndependentSuccessAt = independentSuccesses.at(-1)?.createdAt ?? null;
  const details = {
    assessments: assessments.length,
    independentSuccesses: independentSuccesses.length,
    assistedSuccesses: assistedSuccesses.length,
    partials,
    incorrect,
    exposures,
    reason: "",
  };

  if (assessments.length === 0) {
    return {
      status: "not_assessed",
      confidence: "none",
      lastAssessedAt,
      lastIndependentSuccessAt,
      details: { ...details, reason: exposures ? "Viewed or skipped, but not yet assessed." : "No evidence yet." },
    };
  }

  // Demonstrated: ≥2 independent successes on distinct activities, one at difficulty ≥2
  // (or a transfer/application task), and the most recent assessment is not a failure.
  const distinct = new Set(independentSuccesses.map((e) => e.activityId));
  const hasChallenging = independentSuccesses.some(
    (e) => (e.difficulty ?? 1) >= 2 || e.purpose === "transfer" || e.purpose === "apply",
  );
  const latest = assessments.at(-1)!;
  if (distinct.size >= 2 && hasChallenging && latest.result !== "incorrect") {
    const first = independentSuccesses[0].createdAt.getTime();
    const delayedRecall = independentSuccesses.some(
      (e) => e.purpose === "review" && e.createdAt.getTime() - first >= DAY * 0.9,
    );
    return {
      status: "demonstrated",
      confidence: delayedRecall ? "consolidated" : "provisional",
      lastAssessedAt,
      lastIndependentSuccessAt,
      details: {
        ...details,
        reason: delayedRecall
          ? "Independently demonstrated more than once, including after a delay."
          : "Independently demonstrated more than once; provisional until a delayed review.",
      },
    };
  }

  let reason = "Attempted; more independent evidence needed.";
  if (latest.result === "incorrect" && distinct.size >= 2) reason = "Earlier successes, but the most recent answer missed.";
  else if (assistedSuccesses.length && !independentSuccesses.length) reason = "Correct with help; not yet shown independently.";
  else if (independentSuccesses.length === 1) reason = "One independent success so far.";
  else if (distinct.size >= 2 && !hasChallenging) reason = "Successes so far were on easier questions.";
  return { status: "developing", confidence: "low", lastAssessedAt, lastIndependentSuccessAt, details: { ...details, reason } };
}

/** Lazily overlays "review due" on a stored status — a retention check, not a judgement of forgetting. */
export function displayStatus(status: MasteryStatus, reviewDueAt: Date | null, now = new Date()): DisplayStatus {
  if (status !== "not_assessed" && reviewDueAt && reviewDueAt.getTime() <= now.getTime()) return "review_due";
  return status;
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  not_assessed: "Not assessed",
  developing: "Developing",
  demonstrated: "Demonstrated",
  review_due: "Review due",
};
