import { requirePageUser } from "@/lib/auth/server";
import { getCourseHeader } from "@/lib/services/courses";
import { getSessionView } from "@/lib/services/sessions";
import { LessonPlayer } from "@/components/lesson/lesson-player";

export const dynamic = "force-dynamic";

export default async function LearnPage({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ focus?: string; kind?: string }> }) {
  const user = await requirePageUser();
  const { courseId } = await params;
  const sp = await searchParams;
  const header = await getCourseHeader(user.id, courseId, false);
  const session = header.openSession ? await getSessionView(user.id, header.openSession.id) : null;
  return (
    <LessonPlayer
      key={`${courseId}-${sp.focus ?? ""}-${sp.kind ?? ""}`}
      courseId={courseId}
      initialSession={session}
      nextAction={header.nextAction}
      intent={header.intent}
      autoStart={sp.focus ? { focusConceptId: sp.focus } : sp.kind === "review" ? { kind: "review" } : null}
    />
  );
}
