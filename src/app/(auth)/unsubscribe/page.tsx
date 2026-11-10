import { AuthShell } from "@/components/auth/auth-shell";
import { EmailLinkAction } from "@/components/auth/email-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reminder emails", robots: { index: false }, referrer: "no-referrer" as const };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = ((await searchParams).token ?? "").slice(0, 200);
  return <AuthShell><EmailLinkAction kind="unsubscribe" token={token} /></AuthShell>;
}
