"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, newKey } from "@/lib/client/api";
import type { NextAction, SessionView, InlineError as InlineErrorT } from "@/lib/schemas/dto";
import { Button, InlineError, Spinner } from "@/components/ui/primitives";
import { ActivityView } from "./activity-renderer";
import { FeedbackPanel } from "./feedback";

type View = SessionView & { error?: InlineErrorT | null };
type Busy = null | "start" | "submit" | "next" | "hint" | "explain" | "pause" | "skip";

export function LessonPlayer({
  courseId,
  initialSession,
  nextAction,
  intent,
  autoStart,
}: {
  courseId: string;
  initialSession: View | null;
  nextAction: NextAction;
  intent: "curiosity" | "goal";
  autoStart: { kind?: "review"; focusConceptId?: string } | null;
}) {
  const router = useRouter();
  const [session, setSession] = useState<View | null>(initialSession);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(initialSession?.error ? { message: initialSession.error.message } : null);
  const [choice, setChoice] = useState<string | undefined>(initialSession?.draft?.value.choiceId);
  const [text, setText] = useState<string>(initialSession?.draft?.value.text ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "conflict">("idle");
  const draftVersion = useRef(initialSession?.draft?.version ?? 0);
  const attemptKey = useRef(newKey());
  const assistKey = useRef(newKey());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const activityId = session?.activity?.id ?? null;
  const started = useRef(false);

  const adopt = useCallback((s: View, opts: { resetInput?: boolean } = {}) => {
    setSession(s);
    if (opts.resetInput) {
      setChoice(s.draft?.value.choiceId);
      setText(s.draft?.value.text ?? "");
      draftVersion.current = s.draft?.version ?? 0;
      attemptKey.current = newKey();
      assistKey.current = newKey();
      setSaveState("idle");
    }
    if (s.error) setError({ message: s.error.message, retry: s.error.retryable ? undefined : undefined });
  }, []);

  // Move focus to the new activity/feedback so keyboard and screen-reader users follow transitions.
  // After feedback, focus goes to Continue (the feedback region itself is announced via aria-live).
  useEffect(() => {
    if (session?.phase === "feedback" && continueRef.current) continueRef.current.focus();
    else focusRef.current?.focus();
  }, [activityId, session?.phase]);

  const call = useCallback(
    async (kind: Busy, fn: () => Promise<View>, opts: { resetInput?: boolean; retry?: () => void } = {}) => {
      setBusy(kind);
      setError(null);
      try {
        const s = await fn();
        adopt(s, opts);
        if (s.error) setError({ message: s.error.message, retry: opts.retry });
        return s;
      } catch (e) {
        const err = e instanceof ApiError ? e : null;
        setError({ message: err?.message ?? "Something went wrong.", retry: err?.retryable ? opts.retry : undefined });
        if (err?.code === "conflict" && session) {
          const fresh = await api<{ session: View }>(`/sessions/${session.id}`).catch(() => null);
          if (fresh) adopt(fresh.session, { resetInput: true });
        }
      } finally {
        setBusy(null);
      }
    },
    [adopt, session],
  );

  const start = useCallback(
    (body: { kind?: "review" | "lesson"; focusConceptId?: string } = {}) =>
      call("start", async () => (await api<{ session: View }>(`/courses/${courseId}/sessions`, { body })).session, { resetInput: true, retry: () => start(body) }).then(() => router.refresh()),
    [call, courseId, router],
  );

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      start(autoStart);
    }
  }, [autoStart, start]);

  function saveDraft(value: { choiceId?: string; text?: string }) {
    if (!activityId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        const r = await api<{ version: number }>(`/activities/${activityId}/draft`, { method: "PUT", body: { draft: value, baseVersion: draftVersion.current } });
        draftVersion.current = r.version;
        setSaveState("saved");
      } catch (e) {
        if (e instanceof ApiError && e.code === "conflict") {
          const d = (e.details as { draft?: { version: number } })?.draft;
          if (d) draftVersion.current = d.version;
          setSaveState("conflict");
        } else setSaveState("idle");
      }
    }, 600);
  }

  async function submit(skipped = false) {
    if (!session?.activity) return;
    const a = session.activity;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (a.kind === "explanation") return next();
    const response = skipped ? { skipped: true } : a.kind === "multiple_choice" ? { choiceId: choice } : { text: text.trim() };
    if (!skipped && a.kind === "multiple_choice" && !choice) return;
    if (!skipped && a.kind !== "multiple_choice" && !text.trim()) return;
    const key = attemptKey.current;
    await call(skipped ? "skip" : "submit", async () => (await api<{ session: View }>(`/activities/${a.id}/attempts`, { body: { idempotencyKey: key, response } })).session, {
      retry: () => submit(skipped),
    });
  }

  async function next() {
    if (!session) return;
    const from = session.activity?.id ?? null;
    await call("next", async () => (await api<{ session: View }>(`/sessions/${session.id}/next`, { body: { fromActivityId: from } })).session, { resetInput: true, retry: next });
    router.refresh();
  }

  async function assist(kind: "hint" | "explain") {
    if (!session?.activity) return;
    const key = assistKey.current;
    setBusy(kind);
    setError(null);
    try {
      const r = await api<{ hints?: string[]; altExplanations?: string[] }>(`/activities/${session.activity.id}/${kind}`, { body: { idempotencyKey: key } });
      assistKey.current = newKey();
      setSession((s) => (s ? { ...s, hints: r.hints ?? s.hints, altExplanations: r.altExplanations ?? s.altExplanations } : s));
    } catch (e) {
      setError({ message: e instanceof ApiError ? e.message : "Couldn't get that.", retry: e instanceof ApiError && e.retryable ? () => assist(kind) : undefined });
    } finally {
      setBusy(null);
    }
  }

  async function pause() {
    if (!session) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      if (activityId && session.phase === "awaiting_response") {
        await api(`/activities/${activityId}/draft`, { method: "PUT", body: { draft: { choiceId: choice, text }, baseVersion: draftVersion.current } }).catch(() => {});
      }
    }
    await call("pause", async () => (await api<{ session: View }>(`/sessions/${session.id}/pause`, { body: {} })).session);
    router.refresh();
  }

  // ---------------------------------------------------------------- render

  if (!session || session.status === "completed") {
    const s = session?.summary;
    return (
      <section aria-labelledby="learn-start" className="py-6">
        <div ref={focusRef} tabIndex={-1} className="focus:outline-none">
          {s ? (
            <>
              <h2 id="learn-start" className="mb-2 text-xl font-semibold">Session complete</h2>
              <p className="mb-6 text-ink-soft">
                {s.assessed > 0 ? `You answered ${s.assessed} question${s.assessed === 1 ? "" : "s"}, ${s.correct} correct.` : "Nice work."}{" "}
                {s.conceptsTouched.length > 0 && <>Covered: {s.conceptsTouched.join(", ")}.</>}
              </p>
            </>
          ) : (
            <h2 id="learn-start" className="mb-6 text-xl font-semibold">{busy === "start" ? "Preparing your next activity…" : nextAction.label}</h2>
          )}
        </div>
        {busy === "start" ? (
          <Spinner label="Ada is preparing an activity for you…" />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => start(nextAction.kind === "review" ? { kind: "review" } : {})}>
              {s ? (nextAction.kind === "review" ? "Start review" : "Keep going") : nextAction.kind === "review" ? "Start review" : "Start"}
            </Button>
            {nextAction.kind === "review" && <Button onClick={() => start({ kind: "lesson" })}>Learn something new instead</Button>}
            {s && (
              <Link href={`/app/courses/${courseId}/progress`} className="inline-flex min-h-11 items-center rounded-lg px-4 text-[0.95rem] text-muted hover:bg-surface hover:text-ink">
                See progress
              </Link>
            )}
            {intent === "curiosity" && s && (
              <Link href={`/app/courses/${courseId}/outline`} className="inline-flex min-h-11 items-center rounded-lg px-4 text-[0.95rem] text-muted hover:bg-surface hover:text-ink">
                Explore a branch
              </Link>
            )}
          </div>
        )}
        {error && <div className="mt-6"><InlineError message={error.message} onRetry={error.retry} retrying={!!busy} /></div>}
      </section>
    );
  }

  if (session.status === "paused") {
    return (
      <section className="py-6">
        <div ref={focusRef} tabIndex={-1} className="focus:outline-none">
          <h2 className="mb-2 text-xl font-semibold">Paused</h2>
          <p className="mb-6 text-ink-soft">Your place and any unsent answer are saved.</p>
        </div>
        <Button variant="primary" busy={busy === "start"} onClick={() => start({})}>
          Resume
        </Button>
        {error && <div className="mt-6"><InlineError message={error.message} onRetry={error.retry} /></div>}
      </section>
    );
  }

  const a = session.activity;
  const phase = session.phase;
  const answered = phase === "feedback" || phase === "evaluating";
  const assessable = a && (a.kind === "multiple_choice" || a.kind === "free_response");

  return (
    <section aria-label={session.kind === "review" ? "Review" : "Lesson"} className="py-2">
      <div className="mb-4 flex items-center justify-between text-xs text-muted">
        <span>
          {session.kind === "review" ? "Review" : "Lesson"} · step {session.position || 1}
          {a ? ` · ${a.conceptTitle}` : ""}
        </span>
        <Button variant="quiet" size="sm" onClick={pause} busy={busy === "pause"}>
          Pause
        </Button>
      </div>

      {!a || phase === "choosing_next" ? (
        <div ref={focusRef} tabIndex={-1} className="space-y-4 py-6 focus:outline-none">
          {busy === "next" ? <Spinner label="Preparing the next activity…" /> : !error && <Button variant="primary" onClick={next}>Continue</Button>}
        </div>
      ) : (
        <>
          <div ref={phase === "awaiting_response" ? focusRef : undefined} tabIndex={-1} className="focus:outline-none">
            <ActivityView
              activity={a}
              choice={answered ? session.feedback?.chosenChoiceId ?? choice : choice}
              onChoice={(id) => {
                setChoice(id);
                saveDraft({ choiceId: id });
              }}
              text={answered ? session.feedback?.submittedText ?? text : text}
              onText={(v) => {
                setText(v);
                saveDraft({ text: v });
              }}
              onSubmitShortcut={() => submit()}
              disabled={answered || !!busy}
              feedback={session.feedback}
              altExplanations={session.altExplanations}
              hints={session.hints}
            />
          </div>

          {phase === "awaiting_response" && (
            <div className="mt-6">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  onClick={() => submit()}
                  busy={busy === "submit" || (a.kind === "explanation" && busy === "next")}
                  disabled={!!busy || (a.kind === "multiple_choice" && !choice) || ((a.kind === "free_response" || a.kind === "reflection") && !text.trim())}
                >
                  {a.kind === "explanation" ? a.continueLabel || "Continue" : a.kind === "reflection" ? "Save reflection" : "Check answer"}
                </Button>
                {(a.kind === "free_response" || a.kind === "reflection") && (
                  <span className="text-xs text-muted" aria-live="polite">
                    {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Draft saved" : saveState === "conflict" ? "Edited in another tab — your latest text here will be kept" : "Enter to submit · Shift+Enter for a new line"}
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1" aria-label="Help">
                {assessable && (
                  <Button variant="quiet" size="sm" onClick={() => assist("hint")} busy={busy === "hint"} disabled={!!busy || session.hints.length >= 3}>
                    Hint
                  </Button>
                )}
                <Button variant="quiet" size="sm" onClick={() => assist("explain")} busy={busy === "explain"} disabled={!!busy || session.altExplanations.length >= 3}>
                  Explain differently
                </Button>
                {(assessable || a.kind === "reflection") && (
                  <Button variant="quiet" size="sm" onClick={() => submit(true)} busy={busy === "skip"} disabled={!!busy}>
                    Skip
                  </Button>
                )}
              </div>
              {assessable && (session.hints.length > 0 || session.altExplanations.length > 0) && (
                <p className="mt-2 text-xs text-muted">Help used — this answer will count as assisted practice.</p>
              )}
            </div>
          )}

          {answered && session.feedback && (
            <div ref={phase === "evaluating" ? focusRef : undefined} tabIndex={-1} className="mt-6 focus:outline-none">
              <FeedbackPanel feedback={session.feedback} activityKind={a.kind} />
              <div className="mt-5 flex flex-wrap gap-2">
                {phase === "evaluating" ? (
                  <Button variant="primary" onClick={() => submit()} busy={busy === "submit"}>
                    Retry grading
                  </Button>
                ) : (
                  <Button ref={continueRef} variant="primary" onClick={next} busy={busy === "next"}>
                    Continue
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-6">
          <InlineError message={error.message} onRetry={error.retry ?? (phase === "choosing_next" ? next : undefined)} retrying={!!busy} />
        </div>
      )}
      <p className="mt-10 text-xs text-muted">{session.devModel ? "Placeholder content from the development model — not real AI." : "AI-generated lesson content. It can contain mistakes; check anything high-stakes."}</p>
    </section>
  );
}
