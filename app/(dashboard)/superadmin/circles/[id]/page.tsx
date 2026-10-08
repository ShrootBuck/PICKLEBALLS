import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import {
  ActivityFeed,
  formatNumber,
  humanize,
  Person,
  plural,
  RelativeTime,
  Stat,
  StatGrid,
  userHref,
} from "@/components/super-admin/admin-ui";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/super-admin";
import { getAdminCircle } from "@/lib/super-admin-data";

export const metadata: Metadata = { title: "Circle" };

function inviteStatus(invite: {
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}) {
  if (invite.usedAt) return { label: "Used", variant: "secondary" as const };
  if (invite.revokedAt)
    return { label: "Revoked", variant: "outline" as const };
  if (invite.expiresAt.getTime() < Date.now())
    return { label: "Expired", variant: "outline" as const };
  return { label: "Active", variant: "success" as const };
}

const bucketVariant = {
  PROPOSED: "outline",
  ACTIVE: "default",
  COMPLETED: "success",
  WITHDRAWN: "secondary",
} as const;

export default async function SuperAdminCirclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const data = await getAdminCircle(id);
  if (!data) notFound();
  const { circle, members, taskStatuses } = data;
  const tasks = circle._count.commitments;
  const verified = taskStatuses.VERIFIED ?? 0;

  return (
    <>
      <Link
        href="/superadmin/circles"
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "-ml-2 w-fit",
        })}
      >
        <ArrowLeft data-icon="inline-start" />
        All circles
      </Link>
      <PageHeader title={circle.name}>
        <span className="font-mono">{circle.slug}</span>
        <span>
          Created <RelativeTime date={circle.createdAt} />
        </span>
      </PageHeader>

      <StatGrid>
        <Stat label="Members" value={formatNumber(circle._count.memberships)} />
        <Stat
          label="Tasks"
          value={formatNumber(tasks)}
          hint={`${tasks ? Math.round((verified / tasks) * 100) : 0}% verified, ${formatNumber(taskStatuses.MISSED ?? 0)} missed`}
        />
        <Stat label="Proofs" value={formatNumber(circle._count.proofs)} />
        <Stat
          label="Check-ins"
          value={formatNumber(circle._count.checkInUpdates)}
        />
        <Stat
          label="Comments"
          value={formatNumber(circle._count.socialReplies)}
          hint={plural(circle._count.postLikes, "like")}
        />
        <Stat
          label="Bucket list ideas"
          value={formatNumber(circle._count.bucketItems)}
        />
        <Stat
          label="Screen Time posts"
          value={formatNumber(circle._count.screenTimeSubmissions)}
        />
        <Stat label="AI runs" value={formatNumber(circle._count.aiRuns)} />
      </StatGrid>

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>
            Members{" "}
            <Badge variant="secondary" className="ml-1 tabular-nums">
              {members.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Tasks</TableHead>
                <TableHead className="text-right">Proofs</TableHead>
                <TableHead className="text-right">Check-ins</TableHead>
                <TableHead>Last active here</TableHead>
                <TableHead className="pr-5">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.user.id}>
                  <TableCell className="max-w-72 pl-5">
                    <Person
                      user={member.user}
                      detail={
                        member.user.discordUsername
                          ? `@${member.user.discordUsername}`
                          : null
                      }
                    />
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
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(member.tasks)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(member.proofs)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(member.checkIns)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <RelativeTime date={member.lastActive} />
                  </TableCell>
                  <TableCell className="pr-5 text-muted-foreground">
                    <RelativeTime date={member.createdAt} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed items={data.activity} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bucket list</CardTitle>
          </CardHeader>
          <CardContent>
            {circle.bucketItems.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {circle.bucketItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium [overflow-wrap:anywhere]">
                        {item.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        <Link
                          href={
                            item.proposer ? userHref(item.proposer.id) : "#"
                          }
                          className="hover:underline"
                        >
                          {item.proposer?.name ?? "Deleted member"}
                        </Link>
                        , <RelativeTime date={item.createdAt} />
                      </span>
                    </div>
                    <Badge variant={bucketVariant[item.status]}>
                      {humanize(item.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No ideas yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>
            Invites{" "}
            <Badge variant="secondary" className="ml-1 tabular-nums">
              {circle._count.invites}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {circle.invites.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Label</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created by</TableHead>
                  <TableHead>Used by</TableHead>
                  <TableHead className="pr-5">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {circle.invites.map((invite) => {
                  const status = inviteStatus(invite);
                  return (
                    <TableRow key={invite.id}>
                      <TableCell className="max-w-56 truncate pl-5">
                        {invite.label ?? (
                          <span className="text-muted-foreground">
                            No label
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {invite.role === "OWNER" ? "Owner" : "Member"}
                      </TableCell>
                      <TableCell>
                        {invite.createdBy ? (
                          <Link
                            href={userHref(invite.createdBy.id)}
                            className="hover:underline"
                          >
                            {invite.createdBy.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {invite.usedBy ? (
                          <Link
                            href={userHref(invite.usedBy.id)}
                            className="hover:underline"
                          >
                            {invite.usedBy.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-5 text-muted-foreground">
                        <RelativeTime date={invite.createdAt} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="px-5 pb-5 text-sm text-muted-foreground">
              No invites created.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
