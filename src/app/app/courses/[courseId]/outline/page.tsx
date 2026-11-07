import { requirePageUser } from "@/lib/auth/server";
import { getOutline } from "@/lib/services/courses";
import { OutlineList } from "@/components/course/outline-list";

export const dynamic = "force-dynamic";

export default async function OutlinePage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requirePageUser();
  const { courseId } = await params;
  const outline = await getOutline(user.id, courseId);
  return <OutlineList outline={outline} />;
}
