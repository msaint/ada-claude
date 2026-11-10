"use client";

import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Button, InlineError } from "@/components/ui/primitives";

const input = "min-h-11 w-full rounded-lg border border-line-strong bg-paper px-3 text-ink placeholder:text-muted/70 focus:border-muted focus:outline-none";
const backLink = "text-sm text-muted underline-offset-2 hover:text-ink hover:underline";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/password-reset/request", { body: { email } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4" role="status">
        <h1 className="text-lg font-medium">Check your email</h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          If there&apos;s an Ada account for <span className="font-medium break-words text-ink">{email}</span>, a link to choose a new password is on its way. It works for an hour.
        </p>
        <Link href="/login?mode=signin" className={backLink}>
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Reset password">
      <h1 className="text-lg font-medium">Reset your password</h1>
      <p className="text-sm text-ink-soft">Enter your account email and Ada will send you a link to choose a new password.</p>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm text-ink-soft">
          Email
        </label>
        <input id="email" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
      </div>
      {error && <InlineError message={error} />}
      <Button type="submit" variant="primary" busy={busy} className="w-full">
        Send reset link
      </Button>
      <Link href="/login?mode=signin" className={`${backLink} flex min-h-11 items-center justify-center`}>
        Back to sign in
      </Link>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/password-reset/confirm", { body: { token, password } });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload after auth change is intentional
      window.location.href = "/app";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Choose a new password">
      <h1 className="text-lg font-medium">Choose a new password</h1>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm text-ink-soft">
          New password
        </label>
        <input id="password" type="password" autoComplete="new-password" autoFocus minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className={input} aria-describedby="pw-hint" />
        <p id="pw-hint" className="text-xs text-muted">
          At least 8 characters. You&apos;ll be signed out on other devices.
        </p>
      </div>
      {error && (
        <>
          <InlineError message={error} />
          <Link href="/forgot-password" className={`${backLink} block`}>
            Ask for a new link
          </Link>
        </>
      )}
      <Button type="submit" variant="primary" busy={busy} className="w-full">
        Save password and sign in
      </Button>
    </form>
  );
}

const COPY = {
  verify: {
    title: "Confirm your email",
    body: "Confirm this address so Ada can email you when reviews are due.",
    action: "Confirm email",
    doneTitle: "Email confirmed",
    done: "Ada will email you when reviews are due, at most once a day. You can change this in Settings.",
  },
  unsubscribe: {
    title: "Stop reminder emails?",
    body: "Ada will stop emailing you about due reviews. Your courses and progress aren't affected.",
    action: "Stop these emails",
    doneTitle: "Reminder emails are off",
    done: "You won't get any more reminder emails. You can turn them back on in Settings.",
  },
} as const;

/** One-button confirmation for links that arrive by email (a button, so mail scanners that open links can't trigger it). */
export function EmailLinkAction({ kind, token }: { kind: keyof typeof COPY; token: string }) {
  const copy = COPY[kind];
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act() {
    setBusy(true);
    setError(null);
    try {
      if (kind === "verify") await api("/auth/verify-email/confirm", { body: { token } });
      else {
        const res = await fetch(`/api/email/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" });
        if (!res.ok) throw new Error("failed");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-medium">This link is incomplete</h1>
        <p className="text-sm text-ink-soft">Open the link from the email again, or manage reminders in Settings.</p>
        <Link href="/app/settings" className={backLink}>
          Go to Settings
        </Link>
      </div>
    );
  }
  if (done) {
    return (
      <div className="space-y-4" role="status">
        <h1 className="text-lg font-medium">{copy.doneTitle}</h1>
        <p className="text-sm leading-relaxed text-ink-soft">{copy.done}</p>
        <Link href="/app" className={backLink}>
          Open Ada
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-medium">{copy.title}</h1>
      <p className="text-sm leading-relaxed text-ink-soft">{copy.body}</p>
      {error && <InlineError message={error} />}
      <Button variant="primary" busy={busy} onClick={act} className="w-full">
        {copy.action}
      </Button>
    </div>
  );
}
