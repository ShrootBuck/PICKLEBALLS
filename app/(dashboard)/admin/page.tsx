import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeleteMemberButton } from "@/components/admin/delete-member-button";
import { EditMemberNameButton } from "@/components/admin/edit-member-name-button";
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
import { formatMemberJoined } from "@/lib/time";

export const metadata: Metadata = { title: "Owner tools" };

export default async function AdminPage() {
  const { membership } = await requirePageMembership();
  if (membership.role !== "OWNER") notFound();
  const members = await getPrisma().membership.findMany({
    where: { circleId: membership.circleId },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true } } },
  });
  return (
    <>
      <PageHeader
        title="Owner tools"
        description="Invite friends and manage your circle."
      >
        <Badge variant="secondary" className="w-fit">
          Owner only
        </Badge>
      </PageHeader>
      <InvitePanel />
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
                <TableHead className="text-right">Actions</TableHead>
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
                    <time dateTime={member.createdAt.toISOString()}>
                      {formatMemberJoined(member.createdAt)}
                    </time>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <EditMemberNameButton
                        userId={member.userId}
                        name={member.user.name}
                        circleId={membership.circleId}
                      />
                      {member.role !== "OWNER" && (
                        <DeleteMemberButton
                          userId={member.userId}
                          name={member.user.name}
                          circleId={membership.circleId}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
