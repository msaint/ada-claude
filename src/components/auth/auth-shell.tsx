import Link from "next/link";
import type { ReactNode } from "react";

/** Centered card used by the sign-in, password reset and email link pages. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/app" className="mb-8 block text-2xl font-semibold tracking-tight">
          Ada
        </Link>
        {children}
      </div>
    </main>
  );
}
