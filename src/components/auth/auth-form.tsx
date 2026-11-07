"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Button, InlineError } from "@/components/ui/primitives";

export function AuthForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await api(mode === "signin" ? "/auth/login" : "/auth/signup", { body: mode === "signin" ? { email, password } : { email, password, timezone } });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload after auth change is intentional
      window.location.href = "/app";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const input = "min-h-11 w-full rounded-lg border border-line-strong bg-paper px-3 text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none";
  return (
    <form onSubmit={submit} className="space-y-4" aria-label={mode === "signin" ? "Sign in" : "Create account"}>
      <h1 className="text-lg font-medium">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm text-ink-soft">
          Email
        </label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm text-ink-soft">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          minLength={mode === "signup" ? 8 : undefined}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
          aria-describedby={mode === "signup" ? "pw-hint" : undefined}
        />
        {mode === "signup" && (
          <p id="pw-hint" className="text-xs text-muted">
            At least 8 characters.
          </p>
        )}
      </div>
      {error && <InlineError message={error} />}
      <Button type="submit" variant="primary" busy={busy} className="w-full">
        {mode === "signin" ? "Sign in" : "Create account"}
      </Button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
        }}
        className="min-h-11 w-full text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
      >
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
