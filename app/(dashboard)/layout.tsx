import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { requirePageMembership } from "@/lib/request";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { membership } = await requirePageMembership();
  return (
    <SidebarProvider>
      <AppSidebar
        isOwner={membership.role === "OWNER"}
        user={{
          name: membership.user.name,
          image: membership.user.image,
          initials: membership.user.initials,
          discordUsername: membership.user.discordUsername,
        }}
      />
      <SidebarInset>
        <header className="flex h-14 items-center gap-3 px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <p className="text-sm text-muted-foreground">
            School first. Pickleball after.
          </p>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
