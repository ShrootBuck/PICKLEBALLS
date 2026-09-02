import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppSidebarSkeleton } from "@/components/app-sidebar-skeleton";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePageMembership } from "@/lib/request";

async function SidebarData() {
  const { membership } = await requirePageMembership();
  return (
    <AppSidebar
      isOwner={membership.role === "OWNER"}
      user={{
        name: membership.user.name,
        image: membership.user.image,
        initials: membership.user.initials,
        discordUsername: membership.user.discordUsername,
      }}
    />
  );
}

function DashboardLoadingFallback() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <Suspense fallback={<AppSidebarSkeleton />}>
        <SidebarData />
      </Suspense>
      <SidebarInset>
        <header className="flex h-14 items-center gap-3 px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <p className="text-sm text-muted-foreground">
            School first. Pickleball after.
          </p>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-8">
          <Suspense fallback={<DashboardLoadingFallback />}>{children}</Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
