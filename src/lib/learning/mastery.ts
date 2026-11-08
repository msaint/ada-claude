/**
 * Conservative mastery policy. Status is *derived* from immutable evidence
 * and can be recomputed at any time; it is never a completion meter.
 *
 * Levels are earned, not given: "demonstrated" needs two independent
 * successes on different activities, one of them challenging, and at least
 * one of them *unprompted* recall — not given right after working on the same
 * concept (rule adapted from Jane Street's socratic-tutor skill, MIT).
 */

export type EvidenceResult = "correct" | "partial" | "incorrect" | "uncertain" | "exposure";
export type Independence = "independent" | "assisted";
export type Recall = "prompted" | "unprompted";

export type EvidenceRecord = {
  activityId: string;
  result: EvidenceResult;
  independence: Independence;
  difficulty: number | null;
  purpose: string; // e.g. prediction, placement, check, apply, recall, review, final
  /** "prompted" = answered right after another activity on the same concept. */
  recall?: Recall;
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
    /** Ready to demonstrate except for an unprompted recall check. */
    needsRecall: boolean;
    reason: string;
  };
};

const DAY = 24 * 60 * 60 * 1000;
/** Pre-teaching guesses are baseline information, never proof of mastery. */
const NOT_PROOF = new Set(["prediction"]);
const CHALLENGING_PURPOSES = new Set(["apply", "transfer", "defend", "integrative"]);
const DELAYED_PURPOSES = new Set(["review"]);

export function computeMastery(evidence: EvidenceRecord[]): MasteryEstimate {
  const sorted = [...evidence].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const assessments = sorted.filter((e) => e.result !== "exposure");
  const exposures = sorted.length - assessments.length;
  const independentSuccesses = assessments.filter((e) => e.result === "correct" && e.independence === "independent" && !NOT_PROOF.has(e.purpose));
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
    needsRecall: false,
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

  const distinct = new Set(independentSuccesses.map((e) => e.activityId));
  const hasChallenging = independentSuccesses.some((e) => (e.difficulty ?? 1) >= 2 || CHALLENGING_PURPOSES.has(e.purpose));
  const hasUnprompted = independentSuccesses.some((e) => (e.recall ?? "unprompted") === "unprompted");
  const latest = assessments.at(-1)!;
  const latestMissed = latest.result === "incorrect";

  if (distinct.size >= 2 && hasChallenging && hasUnprompted && !latestMissed) {
    const first = independentSuccesses[0].createdAt.getTime();
    const delayedRecall = independentSuccesses.some((e) => DELAYED_PURPOSES.has(e.purpose) && e.createdAt.getTime() - first >= DAY * 0.9);
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

  const needsRecall = distinct.size >= 2 && hasChallenging && !hasUnprompted && !latestMissed;
  let reason = "Attempted; more independent evidence needed.";
  if (needsRecall) reason = "Correct right after practising it; needs one unprompted recall later.";
  else if (latestMissed && distinct.size >= 2) reason = "Earlier successes, but the most recent answer missed.";
  else if (assistedSuccesses.length && !independentSuccesses.length) reason = "Correct with help; not yet shown independently.";
  else if (independentSuccesses.length === 1) reason = "One independent success so far.";
  else if (distinct.size >= 2 && !hasChallenging) reason = "Successes so far were on easier questions.";
  return { status: "developing", confidence: "low", lastAssessedAt, lastIndependentSuccessAt, details: { ...details, needsRecall, reason } };
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
