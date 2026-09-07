import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { requireSession } from "@/lib/request";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireSession();
  return (
    <>
      <PageHeader title="Settings" description="Make yourself at home." />
      <AppearanceSettings />
    </>
  );
}
