"use client";

import clsx from "clsx";
import { Check, X } from "lucide-react";
import { useId } from "react";
import type { ActivityFeedback, LearnerActivity } from "@/lib/schemas/dto";
import { Markdown } from "@/components/ui/markdown";

/** Renders one activity through a fixed set of safe components (never model-generated HTML). */
export function ActivityView(props: {
  activity: LearnerActivity;
  choice?: string;
  onChoice: (id: string) => void;
  text: string;
  onText: (v: string) => void;
  onSubmitShortcut: () => void;
  disabled: boolean;
  feedback: ActivityFeedback | null;
  altExplanations: string[];
  hints: string[];
}) {
  const { activity: a } = props;
  const promptId = useId();
  const purposeLabel: Record<string, string> = {
    prediction: "Make a prediction — guessing is fine",
    teach: "Learn",
    remediate: "Another way to see it",
    check: "Check your understanding",
    apply: "Apply it",
    review: "Review",
    transfer: "Stretch",
    reflect: "Reflect",
    probe: "Look closer",
    defend: "Defend your answer",
    recall: "Quick recall",
    placement: "Placement — answer what you can",
    final: "Final check",
    integrative: "Final check — putting it together",
  };

  return (
    <article>
      <p className="mb-2 text-xs font-medium tracking-wide text-accent-strong uppercase">{purposeLabel[a.purpose] ?? "Activity"}</p>
      {a.kind === "explanation" ? (
        <>
          {a.title && <h2 className="mb-4 text-xl font-semibold tracking-tight">{a.title}</h2>}
          <Markdown>{a.bodyMarkdown}</Markdown>
          {a.sources && a.sources.length > 0 && (
            <p className="mt-4 text-sm text-muted">
              Sources Ada checked:{" "}
              {a.sources.map((src, i) => (
                <span key={src.url}>
                  {i > 0 && " · "}
                  <a href={src.url} target="_blank" rel="noopener noreferrer nofollow" className="text-ink-soft underline underline-offset-2 hover:text-ink">
                    {src.title?.trim() || hostOf(src.url)}
                  </a>
                </span>
              ))}
            </p>
          )}
        </>
      ) : (
        <div id={promptId}>
          <Markdown>{a.promptMarkdown}</Markdown>
        </div>
      )}

      {props.altExplanations.length > 0 && (
        <div className="mt-6 space-y-4">
          {props.altExplanations.map((x, i) => (
            <div key={i} className="rounded-xl border border-line bg-surface px-5 py-4">
              <p className="mb-1 text-xs font-medium text-muted">Explained differently</p>
              <Markdown compact>{x}</Markdown>
            </div>
          ))}
        </div>
      )}

      {props.hints.length > 0 && (
        <div className="mt-5 rounded-xl border border-accent/15 bg-accent-soft px-5 py-3" aria-live="polite">
          <p className="mb-1 text-xs font-medium text-accent-strong">{props.hints.length === 1 ? "Hint" : "Hints"}</p>
          <ol className="space-y-1">
            {props.hints.map((h, i) => (
              <li key={i}>
                <Markdown compact>{h}</Markdown>
              </li>
            ))}
          </ol>
        </div>
      )}

      {a.kind === "multiple_choice" && (
        <fieldset className="mt-6" aria-labelledby={promptId} disabled={props.disabled}>
          <div role="radiogroup" aria-labelledby={promptId} className="space-y-2">
            {a.choices.map((c) => {
              const fb = props.feedback;
              const isCorrect = fb?.correctChoiceId === c.id;
              const isChosenWrong = fb && fb.chosenChoiceId === c.id && !isCorrect;
              const selected = props.choice === c.id;
              return (
                <label
                  key={c.id}
                  className={clsx(
                    "flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
                    fb ? (isCorrect ? "border-good/50 bg-good-soft" : isChosenWrong ? "border-bad/40 bg-bad-soft" : "border-line opacity-80") : selected ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface",
                    props.disabled && "cursor-default",
                  )}
                >
                  <input type="radio" name={`choice-${a.id}`} value={c.id} checked={selected} onChange={() => props.onChoice(c.id)} className="mt-1 size-4 accent-[var(--color-accent)]" />
                  <span className="flex-1 leading-relaxed">{c.text}</span>
                  {fb && isCorrect && <Check className="mt-0.5 size-5 text-good" aria-label="Correct answer" />}
                  {fb && isChosenWrong && <X className="mt-0.5 size-5 text-bad" aria-label="Your answer" />}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {(a.kind === "free_response" || a.kind === "reflection") && (
        <div className="mt-6">
          <label htmlFor={`answer-${a.id}`} className="mb-1.5 block text-sm font-medium text-ink-soft">
            {a.kind === "reflection" ? "Your reflection" : "Your answer"}
          </label>
          <textarea
            id={`answer-${a.id}`}
            rows={5}
            maxLength={10000}
            value={props.text}
            readOnly={props.disabled}
            onChange={(e) => props.onText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!props.disabled) props.onSubmitShortcut();
              }
            }}
            className="w-full rounded-xl border border-line-strong bg-paper px-4 py-3 leading-relaxed text-ink focus:border-muted focus:outline-none read-only:bg-surface"
          />
        </div>
      )}
    </article>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}
