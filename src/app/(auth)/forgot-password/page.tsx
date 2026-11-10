import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/email-forms";
import { emailEnabled } from "@/lib/email/mailer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  if (!emailEnabled()) redirect("/login?mode=signin");
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
