import { getPageUser } from "@/lib/auth/server";
import { listCourses } from "@/lib/services/courses";
import { usingMockModel } from "@/lib/env";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

/** The shell renders for visitors without any session too, so they can start a course right away. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getPageUser();
  const courses = user ? await listCourses(user.id) : [];
  return (
    <AppShell courses={courses} user={user ? { email: user.email, displayName: user.displayName, isGuest: user.isGuest } : null} devModel={usingMockModel()}>
      {children}
    </AppShell>
  );
}
