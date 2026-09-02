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
      <SidebarInset className="min-h-dvh">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 md:gap-3 md:px-4">
          <SidebarTrigger className="size-9 shrink-0 touch-manipulation md:size-7" />
          <Separator
            orientation="vertical"
            className="hidden h-5 data-vertical:self-center sm:block"
          />
          <p className="hidden text-sm text-muted-foreground sm:block">
            School first. Pickleball after.
          </p>
          <p className="text-sm font-medium sm:hidden">Pickle Balls 🎾</p>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
