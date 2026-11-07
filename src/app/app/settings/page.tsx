import { requirePageUser } from "@/lib/auth/server";
import { getPreferences } from "@/lib/services/account";
import { SettingsForm } from "@/components/settings/settings-form";
import { usingMockModel } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePageUser();
  const prefs = await getPreferences(user.id);
  return (
    <div className="mx-auto w-full max-w-[680px] px-4 pt-6 pb-16 md:px-8 md:pt-10">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">Settings</h1>
      <SettingsForm initial={prefs} devModel={usingMockModel()} />
    </div>
  );
}
