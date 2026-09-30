import { ArrowRight, ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { PushToggle } from "@/components/notifications/push-toggle";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/request";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireSession();
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your appearance, notifications, and account."
      />
      <AppearanceSettings />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <PushToggle />
          <NotificationPreferences />
        </CardContent>
      </Card>
      <div className="flex max-w-2xl flex-wrap items-center justify-between gap-4">
        <Link
          href="/changelog"
          className={buttonVariants({ variant: "ghost" })}
        >
          <ScrollText data-icon="inline-start" />
          What's new
          <ArrowRight data-icon="inline-end" />
        </Link>
        <SignOutButton />
      </div>
    </>
  );
}
