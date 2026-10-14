import { ArrowRight, Bell, Palette, ScrollText, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { PushToggle } from "@/components/notifications/push-toggle";
import { AccountSettings } from "@/components/settings/account-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/request";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { session } = await requireSession();
  const chat = await getPrisma().timeblockChat.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  return (
    <>
      <PageHeader title="Settings" />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <a href="#appearance">
            <Palette className="size-4" />
            Appearance
          </a>
          <a href="#notifications">
            <Bell className="size-4" />
            Notifications
          </a>
          <a href="#account">
            <UserRound className="size-4" />
            Account & circles
          </a>
        </nav>
        <div className="settings-content">
          <section
            id="appearance"
            aria-label="Appearance"
            className="settings-section"
          >
            <AppearanceSettings />
          </section>
          <section
            id="notifications"
            aria-label="Notifications"
            className="settings-section"
          >
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Notifications</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <PushToggle inset={false} />
                <NotificationPreferences />
              </CardContent>
            </Card>
          </section>
          <section
            id="account"
            aria-label="Account and circles"
            className="settings-section"
          >
            <AccountSettings userId={session.user.id} chatId={chat?.id} />
          </section>
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
        </div>
      </div>
    </>
  );
}
