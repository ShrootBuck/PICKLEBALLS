import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { PushToggle } from "@/components/notifications/push-toggle";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/request";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireSession();
  return (
    <>
      <PageHeader title="Settings" description="Make yourself at home." />
      <AppearanceSettings />
      <Card className="mt-6 max-w-2xl">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <PushToggle />
          <NotificationPreferences />
        </CardContent>
      </Card>
    </>
  );
}
