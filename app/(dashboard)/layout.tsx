import { headers } from "next/headers";
import { Suspense } from "react";
import { BellSlot } from "@/components/layout/bell-slot";
import { SidebarSlot } from "@/components/layout/sidebar-slot";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "@/lib/auth";
import { listMyCircles } from "@/lib/circles";
import { requirePageMembership } from "@/lib/request";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Logged-out visitors only ever see the public landing page (at `/`);
  // every other dashboard route still requires a membership below.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return <div className="min-h-full bg-background">{children}</div>;
  }
  const { membership } = await requirePageMembership();
  const memberships = await listMyCircles(session.user.id);
  return (
    <SidebarProvider className="relative h-full min-h-0 overflow-hidden">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <Suspense fallback={null}>
        <SidebarSlot
          userId={session.user.id}
          circleId={membership.circleId}
          isOwner={membership.role === "OWNER"}
          user={{
            name: membership.user.name,
            image: membership.user.image,
            initials: membership.user.initials,
          }}
          circles={memberships.map((item) => ({
            id: item.circle.id,
            name: item.circle.name,
            role: item.role,
          }))}
        />
      </Suspense>
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <SiteHeader
          bell={
            <Suspense fallback={null}>
              <BellSlot
                circleId={membership.circleId}
                userId={session.user.id}
              />
            </Suspense>
          }
        />
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <main
            id="main"
            className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8"
          >
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
