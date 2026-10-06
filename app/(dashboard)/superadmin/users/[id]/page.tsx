import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import {
  ActivityFeed,
  circleHref,
  formatCompact,
  formatNumber,
  humanize,
  plural,
  RelativeTime,
  Stat,
  StatGrid,
} from "@/components/super-admin/admin-ui";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { isSuperAdmin, requireSuperAdmin } from "@/lib/super-admin";
import { getAdminUser } from "@/lib/super-admin-data";
import { formatMemberJoined } from "@/lib/time";

export const metadata: Metadata = { title: "User" };

function describeDevice(userAgent: string | null) {
  if (!userAgent) return "Unknown device";
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Unknown OS";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "App";
  return `${browser} on ${os}`;
}

export default async function SuperAdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const [data, superAdmin] = await Promise.all([
    getAdminUser(id),
    isSuperAdmin(id),
  ]);
  if (!data) notFound();
  const { user, taskStatuses, aiUsage, lastSeen } = data;
  const placeholderEmail = user.email.endsWith("@discord.placeholder.invalid");

  return (
    <>
      <Link
        href="/superadmin/users"
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "-ml-2 w-fit",
        })}
      >
        <ArrowLeft data-icon="inline-start" />
        All users
      </Link>
      <div className="flex min-w-0 items-center gap-4">
        <Avatar className="size-16">
          <AvatarImage src={user.image ?? undefined} alt="" />
          <AvatarFallback className="text-lg">{user.initials}</AvatarFallback>
        </Avatar>
        <PageHeader
          title={user.name}
          description={
            user.discordUsername ? `@${user.discordUsername}` : undefined
          }
        >
          {superAdmin ? <Badge>Super admin</Badge> : null}
          <span>
            Joined <RelativeTime date={user.createdAt} />
          </span>
        </PageHeader>
      </div>

      <StatGrid>
        <Stat
          label="Tasks"
          value={formatNumber(user._count.commitments)}
          hint={`${formatNumber(taskStatuses.DONE ?? 0)} done, ${formatNumber(taskStatuses.MISSED ?? 0)} missed`}
        />
        <Stat
          label="Proofs"
          value={formatNumber(user._count.proofs)}
          hint={`${plural(user._count.proofChallenges, "challenge")} given`}
        />
        <Stat
          label="Check-ins"
          value={formatNumber(user._count.checkInUpdates)}
        />
        <Stat
          label="Comments"
          value={formatNumber(user._count.socialReplies)}
          hint={`${plural(user._count.postLikes, "like")} given`}
        />
        <Stat
          label="Bucket list ideas"
          value={formatNumber(user._count.bucketItems)}
        />
        <Stat
          label="Screen Time posts"
          value={formatNumber(user._count.screenTimeSubmissions)}
        />
        <Stat
          label="AI runs"
          value={formatNumber(user._count.aiRuns)}
          hint={`${formatCompact(aiUsage.inputTokens + aiUsage.outputTokens)} tokens`}
        />
        <Stat
          label="Invites created"
          value={formatNumber(user._count.invitesCreated)}
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">User ID</dt>
              <dd className="font-mono text-xs [overflow-wrap:anywhere]">
                {user.id}
              </dd>
              <dt className="text-muted-foreground">Discord ID</dt>
              <dd className="font-mono text-xs [overflow-wrap:anywhere]">
                {user.discordId ??
                  user.accounts.find((a) => a.providerId === "discord")
                    ?.accountId ??
                  "None"}
              </dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="[overflow-wrap:anywhere]">
                {placeholderEmail ? (
                  <span className="text-muted-foreground">
                    Not shared by Discord
                  </span>
                ) : (
                  <>
                    {user.email}{" "}
                    {user.emailVerified ? (
                      <Badge variant="secondary">Verified</Badge>
                    ) : null}
                  </>
                )}
              </dd>
              <dt className="text-muted-foreground">Theme color</dt>
              <dd>{humanize(user.primaryColor)}</dd>
              <dt className="text-muted-foreground">Push devices</dt>
              <dd className="tabular-nums">{user._count.pushSubscriptions}</dd>
              <dt className="text-muted-foreground">Last seen</dt>
              <dd>
                <RelativeTime date={lastSeen} />
              </dd>
              <dt className="text-muted-foreground">Last AI run</dt>
              <dd>
                <RelativeTime date={aiUsage.lastRun} />
              </dd>
              <dt className="text-muted-foreground">Joined</dt>
              <dd>{formatMemberJoined(user.createdAt)}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Circles{" "}
              <Badge variant="secondary" className="ml-1 tabular-nums">
                {user.memberships.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user.memberships.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {user.memberships.map((membership) => (
                  <li
                    key={membership.circle.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <Link
                      href={circleHref(membership.circle.id)}
                      className="flex min-w-0 flex-col hover:underline"
                    >
                      <span className="truncate font-medium">
                        {membership.circle.name}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {plural(membership.circle._count.memberships, "member")}
                        , joined <RelativeTime date={membership.createdAt} />
                      </span>
                    </Link>
                    <Badge
                      variant={
                        membership.role === "OWNER" ? "default" : "secondary"
                      }
                    >
                      {membership.role === "OWNER" ? "Owner" : "Member"}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not in any circle yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed
              items={data.activity.map((item) => ({ ...item, actor: user }))}
            />
          </CardContent>
        </Card>

        <Card className="pb-0">
          <CardHeader>
            <CardTitle>
              Active sessions{" "}
              <Badge variant="secondary" className="ml-1 tabular-nums">
                {user.sessions.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {user.sessions.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Device</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead className="pr-5">Signed in</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {user.sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell
                        className="pl-5"
                        title={session.userAgent ?? undefined}
                      >
                        {describeDevice(session.userAgent)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <RelativeTime date={session.updatedAt} />
                      </TableCell>
                      <TableCell className="pr-5 text-muted-foreground">
                        <RelativeTime date={session.createdAt} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-5 pb-5 text-sm text-muted-foreground">
                No active sessions.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
