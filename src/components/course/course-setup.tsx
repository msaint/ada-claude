"use client";

import { ArrowLeft, ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, newKey } from "@/lib/client/api";
import type { CourseDraftView } from "@/lib/schemas/dto";
import { Button, InlineError, Spinner } from "@/components/ui/primitives";

type Pending = null | "answer" | "back" | "propose" | "convert" | "adjust";

export function CourseSetup({ initial }: { initial: CourseDraftView }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustment, setAdjustment] = useState("");
  const answerKey = useRef(newKey());
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [draft.nextQuestion?.text, draft.state]);

  function apply(d: CourseDraftView) {
    setDraft(d);
    if (d.error) setError({ message: d.error.message, retry: d.error.retryable ? () => run("propose", () => api<{ draft: CourseDraftView }>(`/course-drafts/${d.id}/propose`, { body: { expectedVersion: d.version } })) : undefined });
    else setError(null);
  }

  async function run(kind: Pending, fn: () => Promise<{ draft: CourseDraftView }>) {
    setPending(kind);
    setError(null);
    try {
      const r = await fn();
      apply(r.draft);
      return r.draft;
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict" && (e.details as { draft?: CourseDraftView })?.draft) {
        apply((e.details as { draft: CourseDraftView }).draft);
        setError({ message: e.message });
      } else {
        setError({ message: e instanceof ApiError ? e.message : "Something went wrong.", retry: e instanceof ApiError && e.retryable ? () => run(kind, fn) : undefined });
      }
    } finally {
      setPending(null);
    }
  }

  async function answer(value: string | null) {
    const key = answerKey.current;
    const body = value === null ? { startNow: true, expectedVersion: draft.version, idempotencyKey: key } : { answer: value, expectedVersion: draft.version, idempotencyKey: key };
    const d = await run("answer", () => api(`/course-drafts/${draft.id}/answer`, { body }));
    if (d) {
      setText("");
      answerKey.current = newKey();
    }
  }

  async function startCourse() {
    setPending("convert");
    setError(null);
    try {
      const r = await api<{ courseId: string }>(`/course-drafts/${draft.id}/convert`, { body: {} });
      router.push(`/app/courses/${r.courseId}`);
      router.refresh();
    } catch (e) {
      setError({ message: e instanceof ApiError ? e.message : "Couldn't create the course.", retry: startCourse });
      setPending(null);
    }
  }

  const q = draft.nextQuestion;
  const learnerTurns = draft.turns.slice(1);
  const thinking = pending === "answer" || pending === "propose" || pending === "adjust" || pending === "back";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 md:py-16">
      <p className="mb-1 text-sm text-muted">New course</p>
      <p className="mb-8 text-xl font-medium text-ink">{draft.topic}</p>

      {learnerTurns.length > 0 && (
        <ol aria-label="Your answers so far" className="mb-8 space-y-2 border-l-2 border-line pl-4 text-sm">
          {learnerTurns.map((t, i) => (
            <li key={i} className={t.role === "ada" ? "text-muted" : "text-ink-soft"}>
              {t.role === "ada" ? t.text : <span className="font-medium text-ink">{t.text}</span>}
            </li>
          ))}
        </ol>
      )}

      {thinking && (
        <div className="mb-6">
          <Spinner label={pending === "back" ? "Going back…" : q ? "Thinking about your answer…" : "Ada is drafting a starting path…"} />
        </div>
      )}

      {draft.state === "collecting" && q && !thinking && (
        <section aria-labelledby="ada-question">
          <h1 id="ada-question" ref={headingRef} tabIndex={-1} className="mb-5 text-2xl leading-snug font-semibold tracking-tight focus:outline-none">
            {q.text}
          </h1>
          {q.options.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Quick answers">
              {q.options.map((o) => (
                <Button key={o} onClick={() => answer(o)} disabled={!!pending}>
                  {o}
                </Button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) answer(text.trim());
            }}
            className="relative"
          >
            <label htmlFor="custom-answer" className="sr-only">
              Or answer in your own words
            </label>
            <input
              id="custom-answer"
              value={text}
              maxLength={1000}
              onChange={(e) => setText(e.target.value)}
              placeholder="Or answer in your own words"
              className="min-h-12 w-full rounded-xl border border-line-strong bg-paper px-4 pr-14 text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none"
            />
            <button type="submit" aria-label="Send answer" disabled={!text.trim() || !!pending} className="absolute top-1/2 right-1.5 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-30">
              <ArrowUp className="size-4" aria-hidden />
            </button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-1">
            {draft.canGoBack && (
              <Button variant="quiet" size="sm" onClick={() => run("back", () => api(`/course-drafts/${draft.id}/back`, { body: { expectedVersion: draft.version } }))} disabled={!!pending}>
                <ArrowLeft className="size-4" aria-hidden /> Back
              </Button>
            )}
            <Button variant="quiet" size="sm" onClick={() => answer(null)} disabled={!!pending} className="ml-auto">
              Start now — let Ada decide
            </Button>
          </div>
        </section>
      )}

      {draft.state === "collecting" && !q && !thinking && !error && (
        <div className="space-y-3">
          <Spinner label="Ada is drafting a starting path…" />
          <Button size="sm" onClick={() => run("propose", () => api(`/course-drafts/${draft.id}/propose`, { body: { expectedVersion: draft.version } }))}>Continue</Button>
        </div>
      )}

      {draft.state === "ready" && draft.proposal && !thinking && (
        <section aria-labelledby="proposal-title" className="rounded-2xl border border-line p-6">
          <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">{draft.proposal.intent === "goal" ? "Goal course" : "Curiosity course"}</p>
          <h1 id="proposal-title" ref={headingRef} tabIndex={-1} className="mb-2 text-2xl font-semibold tracking-tight focus:outline-none">
            {draft.proposal.title}
          </h1>
          <p className="mb-5 leading-relaxed text-ink-soft">{draft.proposal.direction}</p>
          {draft.proposal.successCriteria.length > 0 && (
            <p className="mb-5 text-sm text-ink-soft">
              <span className="font-medium text-ink">You&apos;ll know it&apos;s working when: </span>
              {draft.proposal.successCriteria.join("; ")}
            </p>
          )}
          <h2 className="mb-2 text-sm font-medium text-ink">Your starting path</h2>
          <ol className="mb-5 list-decimal space-y-1 pl-5 text-ink-soft">
            {draft.proposal.initialConceptTitles.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
          <p className="mb-1 text-sm text-muted">
            {draft.proposal.suggestedMinutesWeekly ? `Suggested: about ${draft.proposal.suggestedMinutesWeekly} minutes a week. ` : ""}
            {draft.proposal.cadenceNote} The path adapts as you learn.
          </p>
          {draft.proposal.assumptions.length > 0 && <p className="mb-5 text-sm text-muted">Assumed: {draft.proposal.assumptions.join(" · ")}</p>}
          {draft.devModel && <p className="mb-5 text-xs text-warn">Generated by the development model (placeholder, not real AI).</p>}
          {adjusting ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!adjustment.trim()) return;
                run("adjust", () => api(`/course-drafts/${draft.id}/propose`, { body: { adjustment: adjustment.trim(), expectedVersion: draft.version } })).then((d) => {
                  if (d) {
                    setAdjusting(false);
                    setAdjustment("");
                  }
                });
              }}
              className="space-y-3"
            >
              <label htmlFor="adjust" className="text-sm font-medium">
                What should change?
              </label>
              <input id="adjust" autoFocus value={adjustment} maxLength={500} onChange={(e) => setAdjustment(e.target.value)} placeholder="e.g. more about the history, skip the basics" className="min-h-11 w-full rounded-lg border border-line-strong px-3 focus:border-accent focus:outline-none" />
              <div className="flex gap-2">
                <Button type="submit" variant="primary" disabled={!adjustment.trim()}>Update plan</Button>
                <Button type="button" variant="quiet" onClick={() => setAdjusting(false)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={startCourse} busy={pending === "convert"}>
                Start course
              </Button>
              <Button onClick={() => setAdjusting(true)} disabled={!!pending}>
                Adjust
              </Button>
              {draft.canGoBack && (
                <Button variant="quiet" onClick={() => run("back", () => api(`/course-drafts/${draft.id}/back`, { body: { expectedVersion: draft.version } }))} disabled={!!pending}>
                  <ArrowLeft className="size-4" aria-hidden /> Back
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="mt-6">
          <InlineError message={error.message} onRetry={error.retry} retrying={!!pending} />
        </div>
      )}
    </div>
  );
}
