"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DueReview } from "@/lib/schemas/dto";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/primitives";

export function ReviewQueue({ due, upcoming }: { due: DueReview[]; upcoming: DueReview[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const byCourse = new Map<string, DueReview[]>();
  for (const r of due) byCourse.set(r.courseId, [...(byCourse.get(r.courseId) ?? []), r]);

  async function postpone(id: string) {
    setBusy(id);
    await api(`/reviews/${id}/postpone`, { body: { days: 1 } }).catch(() => {});
    setBusy(null);
    router.refresh();
  }

  return (
    <div>
      {due.length === 0 ? (
        <p className="mb-10 text-ink-soft">Nothing is due right now. Ada will schedule reviews as you show what you know.</p>
      ) : (
        <ul className="mb-10 space-y-4">
          {[...byCourse.entries()].map(([courseId, items]) => (
            <li key={courseId} className="rounded-xl border border-line px-5 py-4">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h2 className="min-w-0 flex-1 font-medium break-words">{items[0].courseTitle}</h2>
                <Link href={`/app/courses/${courseId}?kind=review`} className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-[0.95rem] font-medium text-white hover:bg-accent-strong">
                  Start review
                </Link>
              </div>
              <ul className="space-y-1 text-sm">
                {items.map((r) => (
                  <li key={r.id} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 text-ink-soft">{r.conceptTitle}</span>
                    <Button size="sm" variant="quiet" busy={busy === r.id} onClick={() => postpone(r.id)}>
                      Tomorrow
                    </Button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted">Coming up this week</h2>
          <ul className="space-y-1 text-sm text-ink-soft">
            {upcoming.map((r) => (
              <li key={r.id} className="flex justify-between gap-4">
                <span className="min-w-0 break-words">
                  {r.conceptTitle} <span className="text-muted">· {r.courseTitle}</span>
                </span>
                <span className="shrink-0 text-muted">{r.dueLabel}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
