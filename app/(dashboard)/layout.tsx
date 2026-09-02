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
      <SidebarInset className="min-h-dvh">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 md:gap-3 md:px-4">
          <SidebarTrigger className="size-9 shrink-0 touch-manipulation md:size-7" />
          <Separator orientation="vertical" className="hidden h-5 sm:block" />
          <p className="hidden text-sm text-muted-foreground sm:block">
            School first. Pickleball after.
          </p>
          <p className="text-sm font-medium sm:hidden">Pickle Balls 🎾</p>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8">
          <Suspense fallback={<DashboardLoadingFallback />}>
            {children}
          </Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
