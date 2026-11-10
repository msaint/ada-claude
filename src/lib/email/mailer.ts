import { env } from "@/lib/env";
import { log } from "@/lib/log";

export type Email = { to: string; subject: string; text: string; html: string; headers?: Record<string, string> };

/** Test outbox (EMAIL_TRANSPORT=memory). Never used in production. */
const g = globalThis as unknown as { __adaOutbox?: Email[] };
export const outbox = (): Email[] => (g.__adaOutbox ??= []);

/** True when Ada can send email (Resend configured, or the in-memory test transport). */
export function emailEnabled(): boolean {
  const e = env();
  return e.EMAIL_TRANSPORT === "memory" || (!!e.RESEND_API_KEY && !!e.EMAIL_FROM);
}

/**
 * Sends one email through Resend's HTTP API. Returns false (and logs, without
 * the recipient or content) on failure; callers decide whether that matters.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  const e = env();
  if (e.EMAIL_TRANSPORT === "memory") {
    outbox().push(email);
    return true;
  }
  if (!e.RESEND_API_KEY || !e.EMAIL_FROM) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: e.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text, html: email.html, headers: email.headers }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) log.warn("email_send_failed", { status: res.status });
    return res.ok;
  } catch (err) {
    log.warn("email_send_failed", { error: (err as Error).name });
    return false;
  }
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Minimal, plain layout shared by all Ada emails. `bodyHtml` must already be escaped. */
export function layout(bodyHtml: string, footerHtml = ""): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff;color:#1d1e22;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6">
<div style="max-width:520px;margin:0 auto">
<p style="font-size:18px;font-weight:600;margin:0 0 20px">Ada</p>
${bodyHtml}
<p style="margin-top:32px;font-size:13px;color:#646870">${footerHtml}</p>
</div></body></html>`;
}

export const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#6347d1;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(label)}</a></p>`;
