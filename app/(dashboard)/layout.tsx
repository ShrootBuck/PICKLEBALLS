import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, membership } = await requirePageMembership();
  const [pendingVerdicts, events] = await Promise.all([
    // Proofs waiting on this member's own vote: pending, not theirs,
    // and they have not voted yet.
    getPrisma().taskProof.count({
      where: {
        circleId: membership.circleId,
        reviewStatus: "PENDING",
        replacedById: null,
        ownerId: { not: session.user.id },
        reviews: { none: { reviewerId: session.user.id } },
      },
    }),
    getPrisma().activityEvent.findMany({
      where: { circleId: membership.circleId },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { actor: { select: { name: true } } },
    }),
  ]);
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar
        isOwner={membership.role === "OWNER"}
        pendingVerdicts={pendingVerdicts}
        user={{
          name: membership.user.name,
          image: membership.user.image,
          initials: membership.user.initials,
        }}
      />
      <SidebarInset className="flex h-svh flex-col overflow-hidden">
        <SiteHeader
          events={events.map((event) => ({
            id: event.id,
            kind: event.kind,
            summary: event.summary,
            actorName: event.actor.name,
            createdAt: event.createdAt.toISOString(),
          }))}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-6 md:pb-8">
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
