import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPageUser } from "@/lib/auth/server";
import { listCourses } from "@/lib/services/courses";
import { GUEST_COURSE_LIMIT, latestOpenDraft } from "@/lib/services/drafts";
import { NewCoursePrompt } from "@/components/course/new-course-prompt";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getPageUser();
  const [courses, draft] = user ? await Promise.all([listCourses(user.id), latestOpenDraft(user.id)]) : [[], null];
  const guestAtLimit = !!user?.isGuest && courses.length >= GUEST_COURSE_LIMIT;
  const resumeCourse = courses.find((c) => c.hasOpenSession) ?? null;
  // At most one quiet "pick up" row: whichever was touched most recently.
  let pickUp: { href: string; label: string } | null = null;
  if (draft && (!resumeCourse || draft.updated_at.toISOString() > resumeCourse.updatedAt)) {
    pickUp = { href: `/app/new?draft=${draft.id}`, label: `Finish setting up: ${draft.topic}` };
  } else if (resumeCourse) {
    pickUp = { href: `/app/courses/${resumeCourse.id}`, label: `Pick up where you left off: ${resumeCourse.title}` };
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-4 py-16 md:min-h-dvh">
      <div className="w-full max-w-2xl">
        <h1 className="mb-8 text-center text-3xl font-semibold tracking-tight text-ink md:text-[2.1rem]">What would you like to learn?</h1>
        <NewCoursePrompt needsSession={!user} guestAtLimit={guestAtLimit} />
        {pickUp && (
          <div className="mt-8 text-center">
            <Link href={pickUp.href} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:bg-surface hover:text-ink">
              <span className="max-w-[70vw] truncate">{pickUp.label}</span> <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
