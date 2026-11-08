"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/primitives";
import { ACCOUNT_REQUIRED_EVENT } from "@/lib/client/api";

export const GUEST_DAYS = 14;

function authHref(mode: "signup" | "signin", next: string | null) {
  return `/login?mode=${mode}&next=${encodeURIComponent(next ?? "/app")}`;
}

/** One quiet line for guests: what "guest" means and how to keep progress. */
export function GuestBanner() {
  const pathname = usePathname();
  return (
    <div role="note" className="flex flex-wrap items-center justify-center gap-x-2 border-b border-line bg-surface px-4 py-2 text-center text-xs text-ink-soft">
      <span>You&apos;re trying Ada as a guest. Progress is kept on this device for {GUEST_DAYS} days.</span>
      <Link href={authHref("signup", pathname)} className="font-medium text-accent-strong underline underline-offset-2">
        Create a free account to save it
      </Link>
    </div>
  );
}

/** Opens whenever the API answers `account_required` (second course, guest daily limit). */
export function AccountRequiredDialog() {
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const onEvent = (e: Event) => setMessage((e as CustomEvent<string>).detail || "Create a free account to continue.");
    window.addEventListener(ACCOUNT_REQUIRED_EVENT, onEvent);
    return () => window.removeEventListener(ACCOUNT_REQUIRED_EVENT, onEvent);
  }, []);
  return (
    <Dialog open={message !== null} onClose={() => setMessage(null)} title="Save your progress with an account">
      <p className="mb-2 text-sm leading-relaxed text-ink-soft">{message}</p>
      <p className="mb-5 text-sm leading-relaxed text-ink-soft">It&apos;s free. Everything you&apos;ve done as a guest moves into your account.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={() => setMessage(null)} className="min-h-11 rounded-lg px-4 text-[0.95rem] text-muted hover:bg-surface hover:text-ink">
          Not now
        </button>
        <Link href={authHref("signin", pathname)} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 text-[0.95rem] font-medium hover:bg-surface">
          Sign in
        </Link>
        <Link href={authHref("signup", pathname)} className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-[0.95rem] font-medium text-white hover:bg-accent-strong">
          Create account
        </Link>
      </div>
    </Dialog>
  );
}
