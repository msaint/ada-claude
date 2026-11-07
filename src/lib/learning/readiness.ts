import type { DisplayStatus } from "./mastery";

export type ReadinessBand = "unknown" | "early" | "developing" | "approaching" | "demonstrated";

export type ReadinessConcept = {
  slug: string;
  title: string;
  status: DisplayStatus;
  importance: number;
  prerequisites: string[];
  evidenceCount: number;
};

export const MIN_EVIDENCE_FOR_ESTIMATE = 3;

/**
 * Goal-relative readiness band. Uses coverage of the concepts required by
 * the *current* goal plus prerequisite bottlenecks. Never a percentage; an
 * estimate, not a qualification.
 */
export function estimateReadiness(required: ReadinessConcept[]): { band: ReadinessBand; basis: string; evidenceCount: number } {
  const evidenceCount = required.reduce((n, c) => n + c.evidenceCount, 0);
  if (required.length === 0 || evidenceCount < MIN_EVIDENCE_FOR_ESTIMATE) {
    return { band: "unknown", basis: "Not enough evidence yet. Answer a few questions and Ada will estimate readiness.", evidenceCount };
  }
  const isShown = (s: DisplayStatus) => s === "demonstrated" || s === "review_due";
  const core = required.filter((c) => c.importance >= 2);
  const pool = core.length ? core : required;
  const shown = pool.filter((c) => isShown(c.status));
  const ratio = shown.length / pool.length;
  const bySlug = new Map(required.map((c) => [c.slug, c]));
  const bottlenecks = required.filter(
    (c) => !isShown(c.status) && required.some((d) => d.prerequisites.includes(c.slug) && bySlug.has(d.slug)),
  );

  let band: ReadinessBand;
  if (ratio === 1) band = "demonstrated";
  else if (ratio >= 0.6 && bottlenecks.length <= 1) band = "approaching";
  else if (ratio > 0 || pool.some((c) => c.status === "developing")) band = "developing";
  else band = "early";

  const parts = [
    `Independently demonstrated ${shown.length} of ${pool.length} ${core.length ? "core " : ""}concepts for this goal` +
      (shown.length ? ` (${shown.map((c) => c.title).join(", ")})` : "") +
      ".",
  ];
  if (bottlenecks.length) parts.push(`Prerequisite still to show: ${bottlenecks.slice(0, 3).map((c) => c.title).join(", ")}.`);
  parts.push("Assisted answers and lesson views don't count toward this estimate.");
  return { band, basis: parts.join(" "), evidenceCount };
}

export const BAND_LABEL: Record<ReadinessBand, string> = {
  unknown: "Not enough evidence yet",
  early: "Early",
  developing: "Developing",
  approaching: "Approaching",
  demonstrated: "Demonstrated",
};
