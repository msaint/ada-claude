"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Preferences } from "@/lib/services/account";
import { api, ApiError } from "@/lib/client/api";
import { Button, Dialog, InlineError } from "@/components/ui/primitives";

export function SettingsForm({ initial, devModel }: { initial: Preferences; devModel: boolean }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [savedOptIn, setSavedOptIn] = useState(initial.emailOptIn);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const zones = supportedZones();
  const confirmWord = p.isGuest ? "delete" : (p.email ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await api<{ preferences: Preferences }>("/preferences", {
        method: "PATCH",
        body: { displayName: p.displayName?.trim() || null, timezone: p.timezone, remindersEnabled: p.remindersEnabled, emailOptIn: p.emailOptIn, quietHours: p.quietHours },
      });
      setP(r.preferences);
      setSavedOptIn(r.preferences.emailOptIn);
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    setVerifyNote(null);
    try {
      const r = await api<{ sent: boolean }>("/auth/verify-email/request", { body: {} });
      setVerifyNote(r.sent ? "Sent. Check your inbox." : "Couldn't send another one right now. Try again in an hour.");
    } catch (e) {
      setVerifyNote(e instanceof ApiError ? e.message : "Couldn't send the email.");
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      await api("/account", { method: "DELETE", body: { confirmEmail: confirm } });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload after auth change is intentional
      window.location.href = "/app";
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't delete the account.");
      setBusy(false);
    }
  }

  const canEmail = p.remindersEnabled && !p.isGuest && p.emailAvailable;
  // Based on what's saved, so it doesn't appear before the confirmation email has gone out.
  const needsConfirm = savedOptIn && p.emailOptIn && !p.emailVerified && canEmail;
  const input = "min-h-11 w-full rounded-lg border border-line-strong bg-paper px-3 focus:border-muted focus:outline-none";
  return (
    <div className="space-y-10">
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-8">
        <section className="space-y-4">
          <h2 className="font-semibold">Profile</h2>
          {p.isGuest ? (
            <p className="text-sm text-ink-soft">
              You&apos;re using Ada as a guest. Your progress is kept on this device for 14 days.{" "}
              <a href="/login?mode=signup&next=/app/settings" className="font-medium text-accent-strong underline underline-offset-2">Create a free account</a> to save it.
            </p>
          ) : (
            <p className="text-sm text-muted">Signed in as {p.email}</p>
          )}
          <div>
            <label htmlFor="name" className="mb-1 block text-sm">Display name</label>
            <input id="name" value={p.displayName ?? ""} maxLength={80} onChange={(e) => setP({ ...p, displayName: e.target.value })} className={input} />
          </div>
          <div>
            <label htmlFor="tz" className="mb-1 block text-sm">Time zone</label>
            <select id="tz" value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })} className={input}>
              {[...new Set(["UTC", p.timezone, ...zones])].map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">Review times are shown in this zone.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Reminders</h2>
          <p className="text-sm text-muted">Off by default. Ada never sends reminders unless you turn them on, and at most one nudge a day across all courses.</p>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" checked={p.remindersEnabled} onChange={(e) => setP({ ...p, remindersEnabled: e.target.checked, emailOptIn: e.target.checked ? p.emailOptIn : false })} className="size-4" />
            <span>Remind me when reviews are due</span>
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" disabled={!canEmail} checked={canEmail && p.emailOptIn} onChange={(e) => setP({ ...p, emailOptIn: e.target.checked })} className="size-4" />
            <span className={canEmail ? "" : "text-muted"}>By email{p.email ? ` to ${p.email}` : ""}</span>
          </label>
          {p.isGuest && <p className="text-xs text-muted">Email reminders need an account, so Ada has an address to send to.</p>}
          {!p.isGuest && !p.emailAvailable && <p className="text-xs text-muted">Email isn&apos;t set up on this instance yet, so reminders can&apos;t be sent.</p>}
          {needsConfirm && (
            <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-ink-soft" role="status">
              Confirm your address to start receiving reminders: Ada sent a link to {p.email}.{" "}
              <button type="button" onClick={resendVerification} className="font-medium text-accent-strong underline underline-offset-2">
                Send it again
              </button>
              {verifyNote && <span className="mt-1 block">{verifyNote}</span>}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Quiet hours</span>
            <label className="sr-only" htmlFor="qh-start">Quiet hours start</label>
            <input id="qh-start" type="time" value={p.quietHours.start} onChange={(e) => setP({ ...p, quietHours: { ...p.quietHours, start: e.target.value } })} className="min-h-11 rounded-lg border border-line-strong px-2" />
            <span>to</span>
            <label className="sr-only" htmlFor="qh-end">Quiet hours end</label>
            <input id="qh-end" type="time" value={p.quietHours.end} onChange={(e) => setP({ ...p, quietHours: { ...p.quietHours, end: e.target.value } })} className="min-h-11 rounded-lg border border-line-strong px-2" />
          </div>
          <p className="text-xs text-muted">Ada won&apos;t email during quiet hours, or when you&apos;ve just been studying. Every email has a one-click way to stop them.</p>
        </section>

        {error && !delOpen && <InlineError message={error} />}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" busy={busy}>Save settings</Button>
          {saved && <span role="status" className="text-sm text-good">Saved</span>}
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="font-semibold">How Ada uses AI</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Ada sends your topic, your answers to setup questions, and your lesson answers to a third-party AI model provider to generate lessons and assess answers. It doesn&apos;t send your email or name.
          Generated content can contain mistakes and is educational, not professional advice. Operational events are logged without your answer text.
          {devModel && " This instance is running the development model, so nothing is sent to an AI provider."}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Your data</h2>
        <p className="text-sm text-ink-soft">Download everything Ada stores about you, or permanently delete your account. Individual courses can be deleted from the sidebar menu.</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/v1/account/export" className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 text-[0.95rem] font-medium hover:bg-surface">
            Export my data
          </a>
          <Button variant="secondary" onClick={() => { setError(null); setDelOpen(true); }} className="text-bad">
            {p.isGuest ? "Delete guest data" : "Delete account"}
          </Button>
        </div>
      </section>

      <Dialog open={delOpen} onClose={() => setDelOpen(false)} title={p.isGuest ? "Delete your guest data?" : "Delete your account?"}>
        <form onSubmit={(e) => { e.preventDefault(); deleteAccount(); }} className="space-y-4">
          <p className="text-sm text-ink-soft">This permanently deletes your account, all courses, answers, evidence and reviews. It can&apos;t be undone.</p>
          <div>
            <label htmlFor="confirm-email" className="mb-1 block text-sm">Type <strong>{confirmWord}</strong> to confirm</label>
            <input id="confirm-email" autoFocus value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} autoComplete="off" />
          </div>
          {error && <InlineError message={error} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="quiet" onClick={() => setDelOpen(false)}>Cancel</Button>
            <Button type="submit" variant="danger" busy={busy} disabled={confirm.trim().toLowerCase() !== confirmWord.toLowerCase()}>Delete account</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function supportedZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}
