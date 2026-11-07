import clsx from "clsx";
import type { ActivityFeedback, LearnerActivity } from "@/lib/schemas/dto";
import { Markdown } from "@/components/ui/markdown";

const TITLE: Record<string, string> = {
  correct: "Correct",
  partial: "Partly there",
  incorrect: "Not quite",
  uncertain: "Hard to judge",
  exposure: "Noted",
};

export function FeedbackPanel({ feedback: f, activityKind }: { feedback: ActivityFeedback; activityKind: LearnerActivity["kind"] }) {
  const tone =
    f.status === "pending_evaluation" ? "neutral" : f.result === "correct" ? "good" : f.result === "incorrect" ? "bad" : f.result === "partial" || f.result === "uncertain" ? "warn" : "neutral";
  return (
    <section
      aria-live="polite"
      aria-label="Feedback"
      className={clsx(
        "rounded-xl border px-5 py-4",
        tone === "good" && "border-good/30 bg-good-soft",
        tone === "bad" && "border-bad/25 bg-bad-soft",
        tone === "warn" && "border-warn/25 bg-warn-soft",
        tone === "neutral" && "border-line bg-surface",
      )}
    >
      <h3 className="mb-1 font-semibold">
        {f.status === "pending_evaluation" ? "Answer saved" : f.skipped ? "Skipped" : TITLE[f.result ?? "exposure"]}
        {f.status === "graded" && f.independence === "assisted" && !f.skipped && f.result !== "exposure" && <span className="ml-2 text-xs font-normal text-muted">(with help)</span>}
      </h3>
      <Markdown compact>{f.feedbackMarkdown}</Markdown>
      {f.rationale && (
        <div className="mt-3">
          <Markdown compact>{f.rationale}</Markdown>
        </div>
      )}
      {f.criteria && f.criteria.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {f.criteria.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className={clsx("font-semibold", c.met === "yes" ? "text-good" : c.met === "partly" ? "text-warn" : "text-bad")}>
                {c.met === "yes" ? "✓" : c.met === "partly" ? "~" : "✗"}
              </span>
              <span>
                <span className="sr-only">{c.met === "yes" ? "Met" : c.met === "partly" ? "Partly met" : "Not met"}: </span>
                {c.criterion}
                {c.reason && <span className="text-muted"> — {c.reason}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {f.exampleAnswer && activityKind === "free_response" && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-ink-soft">See an example answer</summary>
          <div className="mt-2">
            <Markdown compact>{f.exampleAnswer}</Markdown>
          </div>
        </details>
      )}
    </section>
  );
}
