import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvitePanel } from "@/components/admin/invite-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";

export const metadata: Metadata = { title: "Owner tools" };

export default async function AdminPage() {
  const { membership } = await requirePageMembership();
  if (membership.role !== "OWNER") notFound();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [invites, members, aiUsage] = await Promise.all([
    getPrisma().invite.findMany({
      where: { circleId: membership.circleId },
      orderBy: { createdAt: "desc" },
      include: { usedBy: true },
    }),
    getPrisma().membership.findMany({
      where: { circleId: membership.circleId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { name: true } },
      },
    }),
    getPrisma().aIRun.groupBy({
      by: ["feature", "status"],
      where: { circleId: membership.circleId, createdAt: { gte: since } },
      _count: true,
      orderBy: [{ feature: "asc" }, { status: "asc" }],
    }),
  ]);
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
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              Members{" "}
              <Badge variant="secondary" className="ml-1 tabular-nums">
                {members.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={`${member.userId}-${member.circleId}`}>
                    <TableCell className="font-medium">
                      {member.user.name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          member.role === "OWNER" ? "default" : "secondary"
                        }
                      >
                        {member.role === "OWNER" ? "Owner" : "Member"}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {member.createdAt.toISOString().slice(0, 10)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI usage, last 24h</CardTitle>
          </CardHeader>
          <CardContent>
            {aiUsage.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aiUsage.map((row) => (
                    <TableRow key={`${row.feature}-${row.status}`}>
                      <TableCell className="font-medium">
                        {row.feature.toLowerCase().replaceAll("_", " ")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "SUCCEEDED" ? "default" : "secondary"
                          }
                        >
                          {row.status.toLowerCase().replaceAll("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row._count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No AI runs in the last day.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
