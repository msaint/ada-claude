import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/server";
import { getCourseHeader } from "@/lib/services/courses";
import { AppError } from "@/lib/errors";
import { CourseHeaderBar } from "@/components/course/course-header";

export const dynamic = "force-dynamic";

export default async function CourseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ courseId: string }> }) {
  const user = await requirePageUser();
  const { courseId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(courseId)) notFound();
  let header;
  try {
    header = await getCourseHeader(user.id, courseId);
  } catch (e) {
    if (e instanceof AppError && e.code === "not_found") notFound();
    throw e;
  }
  return (
    <div className="mx-auto w-full max-w-[860px] px-4 pt-6 pb-16 md:px-8 md:pt-10">
      <CourseHeaderBar header={header} />
      {children}
    </div>
  );
}
