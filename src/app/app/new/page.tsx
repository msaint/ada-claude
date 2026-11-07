import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/server";
import { getDraft } from "@/lib/services/drafts";
import { CourseSetup } from "@/components/course/course-setup";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "New course" };

export default async function NewCoursePage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const user = await requirePageUser();
  const { draft: draftId } = await searchParams;
  if (!draftId || !/^[0-9a-f-]{36}$/i.test(draftId)) redirect("/app");
  const draft = await getDraft(user.id, draftId).catch((e) => {
    if (e instanceof AppError && e.code === "not_found") return null;
    throw e;
  });
  if (!draft) redirect("/app");
  if (draft.state === "converted" && draft.convertedCourseId) redirect(`/app/courses/${draft.convertedCourseId}`);
  return <CourseSetup initial={draft} />;
}
