import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-muted">That page doesn&apos;t exist, or it isn&apos;t yours.</p>
      <Link href="/app" className="text-accent-strong underline underline-offset-2">Back to Ada</Link>
    </main>
  );
}
