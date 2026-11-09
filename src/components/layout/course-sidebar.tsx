"use client";

import clsx from "clsx";
import { LogOut, MoreHorizontal, Plus, RotateCcw, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CourseListItem } from "@/lib/schemas/dto";
import { api, ApiError } from "@/lib/client/api";
import { Button, Dialog, InlineError } from "@/components/ui/primitives";
import type { ShellUser } from "./app-shell";

export function CourseSidebar({
  courses,
  user,
  onNavigate,
  autoFocus,
}: {
  courses: CourseListItem[];
  user: ShellUser;
  onNavigate?: () => void;
  autoFocus?: boolean;
}) {
  const pathname = usePathname();
  const newRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (autoFocus) newRef.current?.focus();
  }, [autoFocus]);
  const anyDue = courses.some((c) => c.reviewDueCount > 0);

  return (
    <nav aria-label="Courses" className="flex h-full flex-col">
      <div className="px-4 pt-4 pb-3">
        <Link href="/app" onClick={onNavigate} className="text-lg font-semibold tracking-tight text-ink">
          Ada
        </Link>
      </div>
      <div className="px-3">
        <Link
          ref={newRef}
          href="/app"
          onClick={onNavigate}
          className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-[0.95rem] text-ink hover:bg-line/60"
        >
          <Plus className="size-4" aria-hidden /> New course
        </Link>
      </div>
      <div className="mx-4 my-3 border-t border-line" />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {courses.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted">Your courses will appear here</p>
        ) : (
          <ul className="space-y-0.5" aria-label="Your courses">
            {courses.map((c) => (
              <CourseItem key={c.id} course={c} active={pathname?.startsWith(`/app/courses/${c.id}`) ?? false} onNavigate={onNavigate} />
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-line px-3 py-3">
        {user && (
          <Link href="/app/review" onClick={onNavigate} className={clsx("flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-line/60", pathname === "/app/review" ? "text-ink" : "text-ink-soft")}>
            <RotateCcw className="size-4" aria-hidden /> Review
            {anyDue && <span className="ml-auto size-2 rounded-full bg-accent" aria-label="Reviews due" />}
          </Link>
        )}
        {user && !user.isGuest ? (
          <>
            <Link href="/app/settings" onClick={onNavigate} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-ink-soft hover:bg-line/60">
              <Settings className="size-4" aria-hidden /> <span className="truncate">{user.displayName || user.email}</span>
            </Link>
            <button
              onClick={async () => {
                await api("/auth/logout", { body: {} }).catch(() => {});
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload after auth change is intentional
                window.location.href = "/app";
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-ink-soft hover:bg-line/60"
            >
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </>
        ) : (
          <>
            {user?.isGuest && (
              <Link href="/app/settings" onClick={onNavigate} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-ink-soft hover:bg-line/60">
                <Settings className="size-4" aria-hidden /> Guest settings
              </Link>
            )}
            <Link href={`/login?mode=signup&next=${encodeURIComponent(pathname ?? "/app")}`} onClick={onNavigate} className="mt-1 flex min-h-11 items-center justify-center rounded-lg bg-accent px-3 text-sm font-medium text-white hover:bg-accent-strong">
              Create free account
            </Link>
            <Link href={`/login?mode=signin&next=${encodeURIComponent(pathname ?? "/app")}`} onClick={onNavigate} className="flex min-h-11 items-center justify-center rounded-lg px-3 text-sm text-ink-soft hover:bg-line/60">
              Sign in
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

function CourseItem({ course, active, onNavigate }: { course: CourseListItem; active: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<null | "rename" | "delete">(null);
  const [title, setTitle] = useState(course.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  async function rename() {
    setBusy(true);
    setError(null);
    try {
      const { course: c } = await api<{ course: { version: number } }>(`/courses/${course.id}`);
      await api(`/courses/${course.id}`, { method: "PATCH", body: { title: title.trim(), expectedVersion: c.version } });
      setDialog(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't rename.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/courses/${course.id}`, { method: "DELETE" });
      setDialog(null);
      if (active) router.push("/app");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't delete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="group relative">
      <Link
        href={`/app/courses/${course.id}`}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={course.title}
        className={clsx(
          "flex min-h-11 items-center gap-2 rounded-lg py-2 pr-10 pl-3 text-[0.95rem]",
          active ? "bg-accent-soft font-medium text-accent-strong" : "text-ink-soft hover:bg-line/60 hover:text-ink",
        )}
      >
        <span className="truncate">{course.title}</span>
        {course.reviewDueCount > 0 && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-accent" aria-label="Review due" />}
      </Link>
      <div ref={menuRef} className="absolute top-1/2 right-1 -translate-y-1/2">
        <button
          aria-label={`Options for ${course.title}`}
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
          className="inline-flex size-9 items-center justify-center rounded-md text-muted opacity-100 hover:bg-line md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
        {menu && (
          <div role="menu" className="absolute right-0 z-30 mt-1 w-40 rounded-lg border border-line bg-paper py-1 shadow-lg">
            <button role="menuitem" autoFocus className="block min-h-10 w-full px-3 text-left text-sm hover:bg-surface" onClick={() => { setMenu(false); setTitle(course.title); setDialog("rename"); }}>
              Rename
            </button>
            <button role="menuitem" className="block min-h-10 w-full px-3 text-left text-sm text-bad hover:bg-surface" onClick={() => { setMenu(false); setDialog("delete"); }}>
              Delete course
            </button>
          </div>
        )}
      </div>
      <Dialog open={dialog === "rename"} onClose={() => setDialog(null)} title="Rename course">
        <form onSubmit={(e) => { e.preventDefault(); rename(); }} className="space-y-4">
          <label htmlFor={`rename-${course.id}`} className="sr-only">Course name</label>
          <input id={`rename-${course.id}`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="min-h-11 w-full rounded-lg border border-line-strong px-3" autoFocus />
          {error && <InlineError message={error} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="quiet" onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="submit" variant="primary" busy={busy} disabled={!title.trim()}>Save</Button>
          </div>
        </form>
      </Dialog>
      <Dialog open={dialog === "delete"} onClose={() => setDialog(null)} title={`Delete “${course.title}”?`}>
        <p className="mb-5 text-sm leading-relaxed text-ink-soft">
          This permanently deletes the course with its lessons, answers, evidence and scheduled reviews. Other courses aren&apos;t affected.
        </p>
        {error && <div className="mb-4"><InlineError message={error} /></div>}
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={() => setDialog(null)} autoFocus>Cancel</Button>
          <Button variant="danger" busy={busy} onClick={remove}>Delete course</Button>
        </div>
      </Dialog>
    </li>
  );
}
