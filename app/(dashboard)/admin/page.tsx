import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvitePanel } from "@/components/admin/invite-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";

export const metadata: Metadata = { title: "Owner tools" };

export default async function AdminPage() {
  const { membership } = await requirePageMembership();
  if (membership.role !== "OWNER") notFound();
  const invites = await getPrisma().invite.findMany({
    where: { circleId: membership.circleId },
    orderBy: { createdAt: "desc" },
    include: { usedBy: true },
  });
  return (
    <>
      <PageHeader
        title="Owner tools"
        description="Make links, inspect who used them, move on."
      >
        <Badge variant="secondary" className="w-fit">
          Owner only
        </Badge>
      </PageHeader>
      <InvitePanel
        invites={invites.map((invite) => ({
          id: invite.id,
          label: invite.label,
          expiresAt: invite.expiresAt.toISOString(),
          usedAt: invite.usedAt?.toISOString() ?? null,
          revokedAt: invite.revokedAt?.toISOString() ?? null,
          usedBy: invite.usedBy?.name ?? null,
        }))}
      />
    </>
  );
}
