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
      <section className="flex flex-col gap-2.5">
        <Badge variant="secondary" className="w-fit">
          Owner only
        </Badge>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance md:text-4xl">
          Tiny squad administration.
        </h1>
        <p className="max-w-xl text-sm text-balance text-muted-foreground md:text-base">
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
