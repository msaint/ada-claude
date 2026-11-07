/** Structured logger with conservative redaction: no emails, secrets, or long learner text in logs. */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRET = /\b(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]+)\b/g;

export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    const s = value.replace(EMAIL, "[email]").replace(SECRET, "[secret]");
    return s.length > 200 ? `${s.slice(0, 200)}…[${s.length} chars]` : s;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = /password|token|secret|key|answer|response|text/i.test(k) && typeof v === "string" ? "[redacted]" : redact(v);
    }
    return out;
  }
  return value;
}

function emit(level: "info" | "warn" | "error", msg: string, fields?: Record<string, unknown>) {
  if (process.env.ADA_SILENT_LOGS === "true") return;
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...(redact(fields ?? {}) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, f?: Record<string, unknown>) => emit("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => emit("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => emit("error", msg, f),
};
