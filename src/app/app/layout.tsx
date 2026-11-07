import { requirePageUser } from "@/lib/auth/server";
import { listCourses } from "@/lib/services/courses";
import { usingMockModel } from "@/lib/env";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const courses = await listCourses(user.id);
  return (
    <AppShell courses={courses} user={{ email: user.email, displayName: user.displayName }} devModel={usingMockModel()}>
      {children}
    </AppShell>
  );
}
