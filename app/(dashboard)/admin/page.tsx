import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvitePanel } from "@/components/admin/invite-panel";
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
      <section className="flex flex-col gap-1">
        <Badge variant="secondary">Owner only</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">
          Tiny squad administration.
        </h1>
        <p className="text-muted-foreground">
          No enterprise cosplay. Make links, inspect who used them, move on.
        </p>
      </section>
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
