"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OutlineView } from "@/lib/schemas/dto";
import { api, ApiError } from "@/lib/client/api";
import { Button, InlineError } from "@/components/ui/primitives";
import { StatusBadge } from "./status-badge";

const RESULT: Record<string, string> = { correct: "Correct", partial: "Partial", incorrect: "Missed", uncertain: "Ungraded", exposure: "Viewed/skipped" };

export function OutlineList({ outline }: { outline: OutlineView }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [branch, setBranch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addBranch() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ firstConceptId: string }>(`/courses/${outline.courseId}/branches`, { body: { question: branch.trim() } });
      setBranch("");
      router.push(`/app/courses/${outline.courseId}?focus=${r.firstConceptId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add that branch.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-5 text-sm text-muted">
        This outline is provisional — Ada adapts it as you learn{outline.curriculumVersion > 1 ? ` (revision ${outline.curriculumVersion})` : ""}.
        {outline.revisionNote ? ` ${outline.revisionNote}` : ""}
      </p>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {outline.concepts.map((c) => {
          const expanded = open === c.id;
          return (
            <li key={c.id} className={clsx(!c.inCurrentPlan && "opacity-70")}>
              <button
                aria-expanded={expanded}
                aria-controls={`concept-${c.id}`}
                onClick={() => setOpen(expanded ? null : c.id)}
                className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface"
                style={{ paddingLeft: `${1 + c.depth * 1.25}rem` }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-ink">{c.title}</span>
                  {(c.origin !== "initial" || !c.inCurrentPlan) && (
                    <span className="text-xs text-muted">{!c.inCurrentPlan ? "From an earlier goal" : c.origin === "branch" ? "Curiosity branch" : "Added for your new goal"}</span>
                  )}
                </span>
                <StatusBadge status={c.status} />
              </button>
              {expanded && (
                <div id={`concept-${c.id}`} className="space-y-3 border-t border-line bg-surface/60 px-5 py-4 text-sm">
                  <div>
                    <h3 className="mb-1 font-medium">What you&apos;ll learn</h3>
                    <p className="text-ink-soft">{c.description}</p>
                    {c.criteria.length > 0 && (
                      <ul className="mt-2 list-disc pl-5 text-ink-soft">
                        {c.criteria.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {c.prerequisiteTitles.length > 0 && <p className="text-muted">Builds on: {c.prerequisiteTitles.join(", ")}</p>}
                  <div>
                    <h3 className="mb-1 font-medium">Evidence</h3>
                    {c.evidence.length === 0 ? (
                      <p className="text-muted">No evidence yet.</p>
                    ) : (
                      <ul className="space-y-0.5 text-ink-soft">
                        {c.evidence.map((e, i) => (
                          <li key={i}>
                            {RESULT[e.result] ?? e.result}
                            {e.independence === "assisted" && e.result !== "exposure" ? " (with help)" : ""} · {e.kind.replace("_", " ")} · {new Date(e.at).toLocaleDateString()}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Button size="sm" variant="primary" onClick={() => router.push(`/app/courses/${outline.courseId}?focus=${c.id}`)}>
                    Study this
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (branch.trim().length >= 2) addBranch();
        }}
      >
        <label htmlFor="branch" className="mb-1.5 block text-sm font-medium">
          Curious about something related?
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="branch" value={branch} maxLength={300} onChange={(e) => setBranch(e.target.value)} placeholder="e.g. wheel wear, what happens at the edge" className="min-h-11 flex-1 rounded-lg border border-line-strong px-3 focus:border-accent focus:outline-none" />
          <Button type="submit" busy={busy} disabled={branch.trim().length < 2}>
            Add to this course
          </Button>
        </div>
        {error && <div className="mt-3"><InlineError message={error} onRetry={addBranch} /></div>}
      </form>
    </div>
  );
}
