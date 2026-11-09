"use client";

import clsx from "clsx";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CourseHeader } from "@/lib/schemas/dto";
import { api, ApiError } from "@/lib/client/api";
import { Button, Dialog, InlineError } from "@/components/ui/primitives";

export function CourseHeaderBar({ header }: { header: CourseHeader }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/app/courses/${header.id}`;
  const tabs = [
    { href: base, label: "Learn" },
    { href: `${base}/outline`, label: "Outline" },
    { href: `${base}/progress`, label: "Progress" },
  ];
  const [menu, setMenu] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalText, setGoalText] = useState(header.goal.text);
  const [intent, setIntent] = useState(header.intent);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  async function saveGoal() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ explanation: string; added: string[] }>(`/courses/${header.id}/goals`, { body: { goalText: goalText.trim(), intent, reason: reason.trim() || undefined } });
      setGoalOpen(false);
      setNotice(`Goal updated. ${r.explanation} Your earlier evidence is kept.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't update the goal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="mb-8">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words text-ink">{header.title}</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="mr-1.5">{header.intent === "goal" ? "Goal:" : "Exploring:"}</span>
            <span className="text-ink-soft">{header.goal.text}</span>
          </p>
        </div>
        <div ref={menuRef} className="relative">
          <button aria-label="Course options" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:bg-surface">
            <MoreHorizontal className="size-5" aria-hidden />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-line bg-paper py-1 shadow-lg">
              <button role="menuitem" autoFocus className="block min-h-10 w-full px-3 text-left text-sm hover:bg-surface" onClick={() => { setMenu(false); setGoalText(header.goal.text); setIntent(header.intent); setGoalOpen(true); }}>
                Change goal
              </button>
            </div>
          )}
        </div>
      </div>
      <nav aria-label="Course sections" className="mt-5 flex gap-1 border-b border-line">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={clsx("-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm", active ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink")}>
              {t.label}
            </Link>
          );
        })}
      </nav>
      {notice && (
        <p role="status" className="mt-4 rounded-lg bg-accent-soft px-4 py-3 text-sm text-ink-soft">
          {notice}
        </p>
      )}
      <Dialog open={goalOpen} onClose={() => setGoalOpen(false)} title="Change this course's goal">
        <form onSubmit={(e) => { e.preventDefault(); saveGoal(); }} className="space-y-4">
          <p className="text-sm text-ink-soft">Ada keeps everything you&apos;ve shown so far and re-plans toward the new goal. Readiness is re-estimated against it.</p>
          <fieldset className="flex gap-4 text-sm">
            <legend className="sr-only">Kind of course</legend>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="intent" checked={intent === "goal"} onChange={() => setIntent("goal")} /> A specific goal</label>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="intent" checked={intent === "curiosity"} onChange={() => setIntent("curiosity")} /> Just exploring</label>
          </fieldset>
          <div>
            <label htmlFor="goal-text" className="mb-1 block text-sm font-medium">{intent === "goal" ? "What do you want to be able to do?" : "What do you want to understand?"}</label>
            <textarea id="goal-text" rows={3} value={goalText} maxLength={600} onChange={(e) => setGoalText(e.target.value)} className="w-full rounded-lg border border-line-strong px-3 py-2 focus:border-muted focus:outline-none" />
          </div>
          <div>
            <label htmlFor="goal-reason" className="mb-1 block text-sm font-medium">Why the change? <span className="font-normal text-muted">(optional)</span></label>
            <input id="goal-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className="min-h-11 w-full rounded-lg border border-line-strong px-3 focus:border-muted focus:outline-none" />
          </div>
          {header.goalHistory.length > 1 && (
            <details className="text-sm text-muted">
              <summary className="cursor-pointer">Earlier goals</summary>
              <ul className="mt-2 space-y-1">
                {header.goalHistory.slice(1).map((g) => (
                  <li key={g.version}>v{g.version}: {g.text}</li>
                ))}
              </ul>
            </details>
          )}
          {error && <InlineError message={error} onRetry={saveGoal} retrying={busy} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="quiet" onClick={() => setGoalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" busy={busy} disabled={goalText.trim().length < 3}>Update goal</Button>
          </div>
        </form>
      </Dialog>
    </header>
  );
}
