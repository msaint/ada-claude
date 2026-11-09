"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { CourseListItem } from "@/lib/schemas/dto";
import { DevModelBanner } from "@/components/ui/primitives";
import { CourseSidebar } from "./course-sidebar";
import { AccountRequiredDialog, GuestBanner } from "@/components/auth/guest";

export type ShellUser = { email: string | null; displayName: string | null; isGuest: boolean } | null;

export function AppShell({
  courses,
  user,
  devModel,
  children,
}: {
  courses: CourseListItem[];
  user: ShellUser;
  devModel: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // The drawer is open only for the route it was opened on, so any navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const drawerOpen = openOn !== null && openOn === pathname;
  const setDrawerOpen = (open: boolean) => setOpenOn(open ? pathname : null);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex min-h-0 flex-1">
        {/* desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-line bg-surface md:block">
          <CourseSidebar courses={courses} user={user} />
        </aside>
        {/* mobile drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button aria-label="Close menu" className="absolute inset-0 bg-black/25" onClick={() => setDrawerOpen(false)} />
            <aside id="mobile-drawer" aria-label="Courses" className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-surface shadow-xl">
              <CourseSidebar courses={courses} user={user} onNavigate={() => setDrawerOpen(false)} autoFocus />
            </aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {devModel && <DevModelBanner />}
          {user?.isGuest && <GuestBanner />}
          <header className="flex h-14 items-center gap-2 border-b border-line px-3 md:hidden">
            <button
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              aria-controls="mobile-drawer"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex size-11 items-center justify-center rounded-lg text-ink hover:bg-surface"
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <span className="font-semibold tracking-tight">Ada</span>
          </header>
          <main id="main" className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </div>
      <AccountRequiredDialog />
    </div>
  );
}
