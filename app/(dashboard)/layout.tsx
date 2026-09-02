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
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 md:px-6">
          <SidebarTrigger className="size-9 shrink-0 touch-manipulation" />
          <Separator
            orientation="vertical"
            className="hidden h-5 data-vertical:self-center sm:block"
          />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">
              🎾
            </span>
            <p className="truncate text-sm text-muted-foreground">
              <span className="font-medium text-foreground">School first.</span>{" "}
              Pickleball after.
            </p>
          </div>
          <p className="shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:hidden">
            Pickle Balls
          </p>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-6 md:p-8 md:pb-10">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
