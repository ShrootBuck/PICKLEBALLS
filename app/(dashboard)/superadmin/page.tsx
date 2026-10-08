import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import {
  ActivityFeed,
  circleHref,
  DailyBars,
  formatBytes,
  formatCompact,
  formatNumber,
  humanize,
  Person,
  plural,
  RelativeTime,
  Stat,
  StatGrid,
} from "@/components/super-admin/admin-ui";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/super-admin";
import { getAdminOverview } from "@/lib/super-admin-data";

function percent(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "0%";
}

export default async function SuperAdminOverviewPage() {
  await requireSuperAdmin();
  const data = await getAdminOverview();
  const { users, circles, tasks, content, system } = data;
  const verified = tasks.byStatus.VERIFIED ?? 0;
  const missed = tasks.byStatus.MISSED ?? 0;
  const aiTotals = data.aiRuns.reduce(
    (sum, row) => ({
      runs: sum.runs + row.count,
      failed: sum.failed + (row.status === "SUCCEEDED" ? 0 : row.count),
      tokens: sum.tokens + row.inputTokens + row.outputTokens,
    }),
    { runs: 0, failed: 0, tokens: 0 },
  );

  return (
    <>
      <PageHeader
        title="Admin console"
        description="Everything happening across every circle on Pickle Balls."
      />

      <section aria-label="Users" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">People</h2>
        <StatGrid>
          <Stat
            label="Total users"
            value={formatNumber(users.total)}
            hint={`+${formatNumber(users.thisWeek)} this week, +${formatNumber(users.thisMonth)} in 30 days`}
          />
          <Stat
            label="Active today"
            value={formatNumber(users.dau)}
            hint={`${percent(users.dau, users.total)} of all users`}
          />
          <Stat
            label="Active this week"
            value={formatNumber(users.wau)}
            hint={`${formatNumber(users.mau)} active in 30 days`}
          />
          <Stat
            label="Without a circle"
            value={formatNumber(users.circleless)}
            hint="Signed up but never joined or started one"
          />
        </StatGrid>
      </section>

      <section
        aria-label="Circles and activity"
        className="flex flex-col gap-3"
      >
        <h2 className="text-sm font-semibold">Circles and activity</h2>
        <StatGrid>
          <Stat
            label="Circles"
            value={formatNumber(circles.total)}
            hint={`+${formatNumber(circles.thisWeek)} this week, avg ${circles.averageSize.toFixed(1)} members`}
          />
          <Stat
            label="Tasks"
            value={formatNumber(tasks.total)}
            hint={`${formatNumber(tasks.thisWeek)} this week, ${percent(verified, tasks.total)} verified, ${percent(missed, tasks.total)} missed`}
          />
          <Stat
            label="Proofs"
            value={formatNumber(content.proofs)}
            hint={`${formatNumber(content.proofsAwaitingReview)} awaiting review`}
          />
          <Stat label="Mood check-ins" value={formatNumber(content.checkIns)} />
          <Stat
            label="Comments"
            value={formatNumber(content.replies)}
            hint={plural(content.likes, "like")}
          />
          <Stat
            label="Bucket list ideas"
            value={formatNumber(content.bucketItems)}
            hint={`${formatNumber(content.bucketCompleted)} completed`}
          />
          <Stat
            label="Screen Time posts"
            value={formatNumber(content.screenTime)}
          />
          <Stat label="Memberships" value={formatNumber(circles.memberships)} />
        </StatGrid>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Last 30 days</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <DailyBars
            label="New users"
            data={data.series.map((point) => ({
              day: point.day,
              value: point.signups,
            }))}
          />
          <DailyBars
            label="Activity events"
            data={data.series.map((point) => ({
              day: point.day,
              value: point.activity,
            }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Newest users</CardTitle>
            <CardAction>
              <Link
                href="/superadmin/users"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                All users
                <ArrowRight data-icon="inline-end" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border">
              {data.recentUsers.map((user) => (
                <li
                  key={user.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <Person
                    user={user}
                    detail={
                      user.discordUsername ? `@${user.discordUsername}` : null
                    }
                  />
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
                    <RelativeTime date={user.createdAt} />
                    <span className="tabular-nums">
                      {user._count.memberships === 0
                        ? "No circles"
                        : plural(user._count.memberships, "circle")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Busiest circles this week</CardTitle>
            <CardAction>
              <Link
                href="/superadmin/circles"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                All circles
                <ArrowRight data-icon="inline-end" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.busyCircles.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {data.busyCircles.map((circle) => (
                  <li
                    key={circle.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <Link
                      href={circleHref(circle.id)}
                      className="flex min-w-0 flex-col hover:underline"
                    >
                      <span className="truncate font-medium">
                        {circle.name}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {plural(circle.members, "member")}
                      </span>
                    </Link>
                    <Badge variant="secondary" className="tabular-nums">
                      {plural(circle.events, "event")}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No circle activity in the last 7 days.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Live activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed items={data.recentActivity} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>System health</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 text-sm">
                <dt className="text-muted-foreground">Signed-in sessions</dt>
                <dd className="text-right tabular-nums">
                  {formatNumber(system.liveSessions)}
                </dd>
                <dt className="text-muted-foreground">Push subscriptions</dt>
                <dd className="text-right tabular-nums">
                  {formatNumber(system.pushSubscriptions)}
                </dd>
                <dt className="text-muted-foreground">Media stored</dt>
                <dd className="text-right tabular-nums">
                  {formatBytes(system.mediaBytes)} in{" "}
                  {plural(system.mediaFiles, "file")}
                </dd>
                <dt className="text-muted-foreground">
                  Media failures (7 days)
                </dt>
                <dd className="text-right tabular-nums">
                  {system.mediaFailures ? (
                    <Badge variant="destructive">
                      {formatNumber(system.mediaFailures)}
                    </Badge>
                  ) : (
                    "0"
                  )}
                </dd>
                <dt className="text-muted-foreground">Stuck proof uploads</dt>
                <dd className="text-right tabular-nums">
                  {system.stuckProofs ? (
                    <Badge variant="destructive">
                      {formatNumber(system.stuckProofs)}
                    </Badge>
                  ) : (
                    "0"
                  )}
                </dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI usage (30 days)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground tabular-nums">
                {plural(aiTotals.runs, "run")}, {formatCompact(aiTotals.tokens)}{" "}
                tokens, {percent(aiTotals.failed, aiTotals.runs)} failed or
                limited
              </p>
              {data.aiRuns.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Runs</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Avg</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.aiRuns.map((row) => (
                      <TableRow key={`${row.feature}:${row.status}`}>
                        <TableCell>{humanize(row.feature)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row.status === "SUCCEEDED"
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {humanize(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.count)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCompact(row.inputTokens + row.outputTokens)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {(row.averageMs / 1000).toFixed(1)}s
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
