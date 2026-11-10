import { AuthShell } from "@/components/auth/auth-shell";
import { EmailLinkAction } from "@/components/auth/email-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your email", robots: { index: false }, referrer: "no-referrer" as const };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = ((await searchParams).token ?? "").slice(0, 200);
  return <AuthShell><EmailLinkAction kind="verify" token={token} /></AuthShell>;
}
