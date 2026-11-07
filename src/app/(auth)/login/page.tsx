import { redirect } from "next/navigation";
import { getPageUser } from "@/lib/auth/server";
import { AuthForm } from "@/components/auth/auth-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getPageUser()) redirect("/app");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="mb-1 text-2xl font-semibold tracking-tight">Ada</p>
        <p className="mb-8 text-muted">Ada teaches what no one bothered to make a course for.</p>
        <AuthForm />
        <p className="mt-8 text-xs leading-relaxed text-muted">
          Ada uses a third-party AI model to generate lessons and assess answers. Don&apos;t include secrets or sensitive personal details in your answers.
        </p>
      </div>
    </main>
  );
}
