import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requirePageMembership } from "@/lib/request";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { membership } = await requirePageMembership();
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar
        isOwner={membership.role === "OWNER"}
        user={{
          name: membership.user.name,
          image: membership.user.image,
          initials: membership.user.initials,
          discordUsername: membership.user.discordUsername,
        }}
      />
      <SidebarInset className="flex h-svh flex-col overflow-hidden">
        <SiteHeader />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-6 md:pb-8">
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
