import type { ConceptProposal, CurriculumExpansion, CurriculumProposal } from "@/lib/schemas/model";

export const MAX_INITIAL_CONCEPTS = 30;
export const TARGET_INITIAL_MIN = 3;
export const TARGET_INITIAL_MAX = 8;

export type ValidationResult<T> = { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[] };

/** Returns concept slugs in a prerequisite-respecting order, or null if there is a cycle. */
export function topoOrder(nodes: { slug: string; prerequisites: string[] }[]): string[] | null {
  const indeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const n of nodes) {
    indeg.set(n.slug, 0);
    out.set(n.slug, []);
  }
  for (const n of nodes) {
    for (const p of n.prerequisites) {
      if (!indeg.has(p)) continue;
      indeg.set(n.slug, (indeg.get(n.slug) ?? 0) + 1);
      out.get(p)!.push(n.slug);
    }
  }
  // Stable: preserve the proposed order among ready nodes.
  const order: string[] = [];
  const ready = nodes.filter((n) => indeg.get(n.slug) === 0).map((n) => n.slug);
  const position = new Map(nodes.map((n, i) => [n.slug, i]));
  while (ready.length) {
    ready.sort((a, b) => position.get(a)! - position.get(b)!);
    const s = ready.shift()!;
    order.push(s);
    for (const t of out.get(s)!) {
      indeg.set(t, indeg.get(t)! - 1);
      if (indeg.get(t) === 0) ready.push(t);
    }
  }
  return order.length === nodes.length ? order : null;
}

function graphErrors(concepts: ConceptProposal[], knownSlugs: Set<string> = new Set()): string[] {
  const errors: string[] = [];
  const slugs = concepts.map((c) => c.slug);
  const seen = new Set<string>();
  for (const s of slugs) {
    if (seen.has(s) || knownSlugs.has(s)) errors.push(`duplicate concept slug "${s}"`);
    seen.add(s);
  }
  for (const c of concepts) {
    for (const p of c.prerequisites) {
      if (p === c.slug) errors.push(`concept "${c.slug}" lists itself as a prerequisite`);
      else if (!seen.has(p) && !knownSlugs.has(p)) errors.push(`concept "${c.slug}" references unknown prerequisite "${p}"`);
    }
  }
  if (errors.length === 0 && topoOrder(concepts) === null) errors.push("prerequisite graph contains a cycle");
  return errors;
}

/**
 * Semantic validation of a curriculum proposal (after Zod parsing). Small
 * safe repairs (dedupe prerequisites, re-pick a first concept that has
 * prerequisites, reorder topologically) are applied; anything structural is
 * an error so the caller can ask the model to repair once, then fail cleanly.
 */
export function validateCurriculum(p: CurriculumProposal): ValidationResult<CurriculumProposal> {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (p.concepts.length > MAX_INITIAL_CONCEPTS) errors.push(`too many concepts (${p.concepts.length} > ${MAX_INITIAL_CONCEPTS})`);
  if (p.concepts.length < TARGET_INITIAL_MIN) errors.push(`too few concepts (${p.concepts.length} < ${TARGET_INITIAL_MIN})`);
  if (p.concepts.length > TARGET_INITIAL_MAX) warnings.push(`more concepts than the P0 target (${p.concepts.length})`);
  const concepts = p.concepts.map((c) => ({ ...c, prerequisites: [...new Set(c.prerequisites)] }));
  errors.push(...graphErrors(concepts));
  if (errors.length) return { ok: false, errors };

  const order = topoOrder(concepts)!;
  const bySlug = new Map(concepts.map((c) => [c.slug, c]));
  const sorted = order.map((s) => bySlug.get(s)!);
  let first = p.first_concept_slug;
  const firstNode = bySlug.get(first);
  if (!firstNode) {
    warnings.push(`first_concept_slug "${first}" not found; using first in order`);
    first = sorted[0].slug;
  } else if (firstNode.prerequisites.length > 0) {
    warnings.push(`first concept "${first}" has prerequisites; using first in order`);
    first = sorted[0].slug;
  }
  return { ok: true, value: { ...p, concepts: sorted, first_concept_slug: first }, warnings };
}

export function validateExpansion(
  e: CurriculumExpansion,
  existingSlugs: string[],
  mode: "branch" | "revise",
): ValidationResult<CurriculumExpansion> {
  const errors: string[] = [];
  const known = new Set(existingSlugs);
  const concepts = e.new_concepts.map((c) => ({ ...c, prerequisites: [...new Set(c.prerequisites)] }));
  if (mode === "branch" && concepts.length === 0) errors.push("a branch must add at least one concept");
  if (concepts.length + existingSlugs.length > 60) errors.push("course graph would exceed 60 concepts");
  errors.push(...graphErrors(concepts, known));
  if (e.anchor_slug && !known.has(e.anchor_slug)) errors.push(`anchor_slug "${e.anchor_slug}" is not an existing concept`);
  const keep = e.keep_slugs.filter((s) => known.has(s));
  if (mode === "revise" && keep.length + concepts.length === 0) errors.push("revised plan must keep or add at least one concept");
  if (errors.length) return { ok: false, errors };
  const order = topoOrder(concepts);
  const bySlug = new Map(concepts.map((c) => [c.slug, c]));
  return {
    ok: true,
    value: { ...e, new_concepts: (order ?? []).map((s) => bySlug.get(s)!), keep_slugs: keep },
    warnings: [],
  };
}
