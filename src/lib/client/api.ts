"use client";

/** Browser-side fetch wrapper for /api/v1. Parses the standard error envelope; network failures are retryable. */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("network", "You seem to be offline. Your input is kept — retry when you're back.", true, 0);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError("internal", "Unexpected response from the server.", true, res.status);
  }
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string; retryable: boolean; details?: unknown } })?.error;
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload after auth change is intentional
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth")) window.location.href = "/login";
    throw new ApiError(err?.code ?? "internal", err?.message ?? "Something went wrong.", err?.retryable ?? res.status >= 500, res.status, err?.details);
  }
  return data as T;
}

export const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
