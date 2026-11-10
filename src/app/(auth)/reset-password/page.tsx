import { AuthShell } from "@/components/auth/auth-shell";
import { EmailLinkAction, ResetPasswordForm } from "@/components/auth/email-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a new password", robots: { index: false }, referrer: "no-referrer" as const };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = ((await searchParams).token ?? "").slice(0, 200);
  return <AuthShell>{token ? <ResetPasswordForm token={token} /> : <EmailLinkAction kind="verify" token="" />}</AuthShell>;
}
