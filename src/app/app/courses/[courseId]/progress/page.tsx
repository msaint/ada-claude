import Link from "next/link";
import { requirePageUser } from "@/lib/auth/server";
import { getProgress } from "@/lib/services/courses";
import { BAND_LABEL } from "@/lib/learning/readiness";
import { StatusBadge } from "@/components/course/status-badge";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function ProgressPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requirePageUser();
  const { courseId } = await params;
  const p = await getProgress(user.id, courseId, user.timezone);
  const empty = p.concepts.every((c) => c.evidenceCount === 0);

  return (
    <div>
      {p.intent === "goal" && p.readiness && (
        <section className="mb-8 rounded-xl border border-line px-5 py-4">
          <p className="text-sm text-muted">Estimated readiness for: <span className="text-ink-soft">{p.goalText}</span></p>
          <p className="mt-1 text-xl font-semibold">{BAND_LABEL[p.readiness.band]}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{p.readiness.basis}</p>
          <p className="mt-2 text-xs text-muted">An estimate from your answers so far — not a qualification.</p>
        </section>
      )}

      {p.intent === "curiosity" && p.curiosity && (
        <section className="mb-8 rounded-xl border border-line px-5 py-4">
          <p className="text-sm text-muted">Exploring: <span className="text-ink-soft">{p.goalText}</span></p>
          <p className="mt-1 text-ink">
            {p.curiosity.exploredCount === 0 ? "Nothing explored yet." : `You've explored ${p.curiosity.exploredCount} idea${p.curiosity.exploredCount === 1 ? "" : "s"}`}
            {p.curiosity.branchCount > 0 ? ` and opened ${p.curiosity.branchCount} branch${p.curiosity.branchCount === 1 ? "" : "es"}` : ""}
            {p.curiosity.exploredCount > 0 ? "." : ""}
          </p>
          <p className="mt-2 text-xs text-muted">Open-ended topics have no finish line, so there&apos;s no completion score here.</p>
        </section>
      )}

      {empty ? (
        <p className="mb-8 text-ink-soft">Not enough evidence yet. Answer a few questions in Learn and Ada will show what you can do.</p>
      ) : (
        <>
          <Section title="What you can do">
            {p.canDo.length === 0 ? (
              <p className="text-sm text-muted">Nothing independently demonstrated yet. That takes two independent correct answers, at least one of them a harder one.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {p.canDo.map((c) => (
                  <li key={c.title}>
                    <span className="font-medium">{c.title}</span>
                    {c.criteria[0] && <span className="text-ink-soft"> — {c.criteria[0]}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Needs more practice">
            {p.needsPractice.length === 0 ? (
              <p className="text-sm text-muted">Nothing in progress.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {p.needsPractice.map((c) => (
                  <li key={c.title}>
                    <span className="font-medium">{c.title}</span> <span className="text-ink-soft">— {c.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      <Section title="Due to revisit">
        {p.dueToRevisit.length === 0 ? (
          <p className="text-sm text-muted">No reviews scheduled yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {p.dueToRevisit.map((r) => (
              <li key={r.conceptTitle} className="flex justify-between gap-4">
                <span>{r.conceptTitle}</span>
                <span className="text-muted">{r.dueLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {p.curiosity && (p.curiosity.openQuestions.length > 0 || p.curiosity.recentExplanations.length > 0 || p.curiosity.suggestedBranches.length > 0) && (
        <>
          {p.curiosity.recentExplanations.length > 0 && (
            <Section title="Recent explanations you gave">
              <ul className="space-y-1 text-sm text-ink-soft">
                {p.curiosity.recentExplanations.map((e, i) => (
                  <li key={i}>{e.conceptTitle} · <span className="text-muted">{e.at}</span></li>
                ))}
              </ul>
            </Section>
          )}
          {p.curiosity.openQuestions.length > 0 && (
            <Section title="Your open questions">
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
                {p.curiosity.openQuestions.map((q, i) => (
                  <li key={i} className="break-words">{q}</li>
                ))}
              </ul>
            </Section>
          )}
          {p.curiosity.suggestedBranches.length > 0 && (
            <Section title="Still to explore">
              <p className="text-sm text-ink-soft">{p.curiosity.suggestedBranches.join(" · ")}</p>
            </Section>
          )}
        </>
      )}

      <Section title="All concepts">
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {p.concepts.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 break-words">{c.title}</span>
              <StatusBadge status={c.status} />
            </li>
          ))}
        </ul>
      </Section>

      <p className="text-xs text-muted">
        Activity so far: {p.activity.sessions} session{p.activity.sessions === 1 ? "" : "s"}, {p.activity.activities} activities. Activity counts aren&apos;t proficiency.{" "}
        <Link href={`/app/courses/${courseId}`} className="underline underline-offset-2 hover:text-ink">
          {p.nextAction.label}
        </Link>
      </p>
    </div>
  );
}
