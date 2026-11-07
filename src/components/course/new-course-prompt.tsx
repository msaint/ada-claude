"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api, ApiError, newKey } from "@/lib/client/api";
import { InlineError } from "@/components/ui/primitives";
import type { CourseDraftView } from "@/lib/schemas/dto";

const MAX = 500;

export function NewCoursePrompt() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per intended submission so double-submits/retries create a single draft.
  const keyRef = useRef(newKey());

  async function submit() {
    const t = topic.trim();
    if (!t || t.length > MAX || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { draft } = await api<{ draft: CourseDraftView }>("/course-drafts", { body: { topic: t, idempotencyKey: keyRef.current } });
      router.push(`/app/new?draft=${draft.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const over = topic.length > MAX;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="relative rounded-2xl border border-line-strong bg-paper shadow-sm focus-within:border-accent">
        <label htmlFor="topic" className="sr-only">
          What would you like to learn?
        </label>
        <textarea
          id="topic"
          rows={2}
          autoFocus
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            keyRef.current = newKey();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Black holes, chess openings, why train wheels are tapered…"
          aria-invalid={over || undefined}
          aria-describedby="topic-help"
          className="block max-h-48 min-h-16 w-full resize-none rounded-2xl bg-transparent px-5 py-4 pr-16 text-[1.05rem] leading-relaxed text-ink placeholder:text-muted/70 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Start"
          disabled={!topic.trim() || over || busy}
          className="absolute right-3 bottom-3 inline-flex size-11 items-center justify-center rounded-xl bg-accent text-white transition-opacity hover:bg-accent-strong disabled:opacity-30"
        >
          <ArrowUp className="size-5" aria-hidden />
        </button>
      </div>
      <p id="topic-help" className={`mt-2 min-h-5 text-center text-xs ${over ? "text-bad" : "text-muted"}`} aria-live="polite">
        {busy ? "Ada is thinking about your topic…" : over ? `Keep it under ${MAX} characters (${topic.length}).` : "Any topic. Ada builds the course."}
      </p>
      {error && <InlineError message={error} onRetry={submit} />}
    </form>
  );
}
