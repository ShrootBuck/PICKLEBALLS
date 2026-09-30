import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeleteMemberButton } from "@/components/admin/delete-member-button";
import { EditMemberNameButton } from "@/components/admin/edit-member-name-button";
import { InvitePanel } from "@/components/admin/invite-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        description="Invite friends to this circle and manage its members."
      />
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
          <ul aria-label="Circle members" className="divide-y divide-border">
            {members.map((member) => (
              <li
                key={`${member.userId}-${member.circleId}`}
                className="flex min-w-0 flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 font-medium">{member.user.name}</p>
                    <Badge
                      variant={
                        member.role === "OWNER" ? "default" : "secondary"
                      }
                    >
                      {member.role === "OWNER" ? "Owner" : "Member"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Joined{" "}
                    <time dateTime={member.createdAt.toISOString()}>
                      {formatMemberJoined(member.createdAt)}
                    </time>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
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
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
