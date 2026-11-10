import { requirePageUser } from "@/lib/auth/server";
import { getCourseHeader } from "@/lib/services/courses";
import { getSessionView } from "@/lib/services/sessions";
import { LessonPlayer } from "@/components/lesson/lesson-player";

export const dynamic = "force-dynamic";

export default async function LearnPage({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ focus?: string; kind?: string; start?: string }> }) {
  const user = await requirePageUser();
  const { courseId } = await params;
  const sp = await searchParams;
  const header = await getCourseHeader(user.id, courseId, false);
  const session = header.openSession ? await getSessionView(user.id, header.openSession.id) : null;
  return (
    <LessonPlayer
      // `start` is deliberately not part of the key: clearing it from the URL must not remount
      // the lesson (that would discard an answer the learner has already begun).
      key={`${courseId}-${sp.focus ?? ""}-${sp.kind ?? ""}`}
      courseId={courseId}
      initialSession={session}
      nextAction={header.nextAction}
      intent={header.intent}
      clearStartParam={sp.start === "1"}
      autoStart={
        sp.focus
          ? { focusConceptId: sp.focus }
          : sp.kind === "review"
            ? { kind: "review" }
            : // Fresh from setup: begin the first lesson right away (placement and reviews keep their own start screens).
              sp.start === "1" && !header.openSession && header.nextAction.kind === "learn"
              ? { kind: "lesson" }
              : null
      }
    />
  );
}
