import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageUser } from "@/lib/auth/server";
import { emailEnabled } from "@/lib/email/mailer";
import { AuthForm } from "@/components/auth/auth-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/app");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; next?: string }> }) {
  const user = await getPageUser();
  const sp = await searchParams;
  const next = safeNext(sp.next);
  // Account holders don't need this page; guests do (to save their progress).
  if (user && !user.isGuest) redirect(next);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/app" className="mb-1 block text-2xl font-semibold tracking-tight">
          Ada
        </Link>
        <p className="mb-8 text-muted">Ada teaches what no one bothered to make a course for.</p>
        <AuthForm initialMode={sp.mode === "signup" || (user?.isGuest && sp.mode !== "signin") ? "signup" : "signin"} isGuest={!!user?.isGuest} next={next} canReset={emailEnabled()} />
        {!user && (
          <p className="mt-6 text-center text-sm">
            <Link href="/app" className="text-muted underline-offset-2 hover:text-ink hover:underline">
              Or try Ada first, no account needed
            </Link>
          </p>
        )}
        <p className="mt-8 text-xs leading-relaxed text-muted">
          Ada uses a third-party AI model to generate lessons and assess answers. Don&apos;t include secrets or sensitive personal details in your answers.
        </p>
      </div>
    </main>
  );
}
