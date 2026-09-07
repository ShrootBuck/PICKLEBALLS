import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  Trophy,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDestination } from "@/components/circles/circle-destination";
import { PageHeader } from "@/components/layout/page-header";
import { ScreenTimeUpload } from "@/components/screen-time/upload";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";
import {
  formatScreenTime,
  isScreenTimeWeek,
  latestScreenTimeWeek,
  rankScreenTime,
  screenTimeWeekLabel,
} from "@/lib/screen-time";
import { requireDateKey } from "@/lib/time";
import { shiftDateKey } from "@/lib/timeblocks";

export const metadata: Metadata = { title: "Screen Time" };

export default async function ScreenTimePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; circle?: string }>;
}) {
  const { session, membership } = await requirePageMembership();
  const params = await searchParams;
  const latest = latestScreenTimeWeek();
  const week =
    typeof params.week === "string" && isScreenTimeWeek(params.week, latest)
      ? params.week
      : latest;
  const href = (start: string) => `/screen-time?week=${start}`;
  const prisma = getPrisma();
  if (
    typeof params.circle === "string" &&
    params.circle !== membership.circleId
  ) {
    const destination = await prisma.membership.findUnique({
      where: {
        userId_circleId: { userId: session.user.id, circleId: params.circle },
      },
      select: { circleId: true },
    });
    if (!destination) notFound();
    return (
      <CircleDestination
        circleId={destination.circleId}
        destination={href(week)}
      />
    );
  }
  const circleId = membership.circleId;
  const previous = shiftDateKey(week, -7);
  const [members, submissions, history] = await Promise.all([
    prisma.membership.findMany({
      where: { circleId },
      select: { userId: true, user: { select: { name: true } } },
    }),
    prisma.screenTimeSubmission.findMany({
      where: {
        circleId,
        weekStart: { in: [requireDateKey(week), requireDateKey(previous)] },
      },
      include: { reading: true },
    }),
    prisma.screenTimeSubmission.findMany({
      where: {
        userId: session.user.id,
        circleId,
        weekStart: {
          gte: requireDateKey(shiftDateKey(latest, -77)),
          lte: requireDateKey(latest),
        },
      },
      include: { reading: true },
      orderBy: { weekStart: "desc" },
    }),
  ]);
  const byWeek = (userId: string, start: string) =>
    submissions.find(
      (row) =>
        row.userId === userId &&
        row.weekStart.toISOString().slice(0, 10) === start,
    )?.reading;
  const standings = rankScreenTime(
    members.map((member) => {
      const current = byWeek(member.userId, week);
      return {
        userId: member.userId,
        name: member.user.name,
        dailyAverageMinutes: current?.dailyAverageMinutes ?? null,
        previousDailyAverageMinutes:
          byWeek(member.userId, previous)?.dailyAverageMinutes ?? null,
        mediaId: current?.mediaId ?? null,
      };
    }),
  );
  const submitted = standings.filter((row) => row.rank !== null).length;
  const bestImprovement = Math.max(
    0,
    ...standings.map((row) => row.improvement ?? 0),
  );
  const ownAverage = byWeek(session.user.id, week)?.dailyAverageMinutes ?? null;
  const latestSubmission = history.find(
    (row) => row.weekStart.toISOString().slice(0, 10) === latest,
  );
  return (
    <>
      <PageHeader
        title="Screen Time"
        description="One completed week. One screenshot. See where your time went."
      >
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{membership.circle.name}</Badge>
          <Badge variant="outline">
            {submitted} of {members.length} submitted
          </Badge>
          <Badge variant="outline">iPhone only</Badge>
        </div>
      </PageHeader>
      <nav
        aria-label="Screen time weeks"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <Link
          href={href(previous)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ChevronLeft data-icon="inline-start" />
          Previous week
        </Link>
        <p className="text-sm font-medium">{screenTimeWeekLabel(week)}</p>
        {week < latest ? (
          <Link
            href={href(shiftDateKey(week, 7))}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Next week
            <ChevronRight data-icon="inline-end" />
          </Link>
        ) : (
          <Badge variant="secondary">Latest completed week</Badge>
        )}
      </nav>
      <Card>
        <CardHeader>
          <CardTitle>Weekly leaderboard</CardTitle>
          <CardDescription>
            Lowest daily average first. Equal times share a rank. Change
            compares the immediately previous week.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
              <TableCaption>
                {submitted === 0
                  ? "No submissions yet. Be the first to post this week."
                  : "Missing submissions stay unranked. Screen time is a useful signal, not a measure of how productive you were."}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Rank</TableHead>
                  <TableHead scope="col">Member</TableHead>
                  <TableHead scope="col">Daily average</TableHead>
                  <TableHead scope="col">Change</TableHead>
                  <TableHead scope="col">Screenshot</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standings.map((row) => (
                  <TableRow
                    key={row.userId}
                    data-state={
                      row.userId === session.user.id ? "selected" : undefined
                    }
                  >
                    <TableCell className="tabular-nums">
                      {row.rank === 1 ? (
                        <span className="flex items-center gap-1">
                          <Trophy className="size-4" aria-hidden="true" />1
                        </span>
                      ) : (
                        (row.rank ?? "—")
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>
                          {row.name}
                          {row.userId === session.user.id ? " (you)" : ""}
                        </span>
                        {bestImprovement > 0 &&
                          row.improvement === bestImprovement && (
                            <Badge variant="secondary">Most improved</Badge>
                          )}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.dailyAverageMinutes === null ? (
                        <Badge variant="outline">Not submitted</Badge>
                      ) : (
                        formatScreenTime(row.dailyAverageMinutes)
                      )}
                    </TableCell>
                    <TableCell>
                      {row.improvement === null ? (
                        "—"
                      ) : row.improvement === 0 ? (
                        "No change"
                      ) : (
                        <span className="flex items-center gap-1 tabular-nums">
                          {row.improvement > 0 ? (
                            <ArrowDown className="size-4" aria-hidden="true" />
                          ) : (
                            <ArrowUp className="size-4" aria-hidden="true" />
                          )}
                          {formatScreenTime(Math.abs(row.improvement))}{" "}
                          {row.improvement > 0 ? "less" : "more"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.mediaId ? (
                        <a
                          href={`/api/media/${row.mediaId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-4"
                          aria-label={`View ${row.name}'s screenshot`}
                        >
                          View
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-4 md:hidden">
            <ItemGroup aria-label="Weekly rankings">
              {standings.map((row) => (
                <Item
                  key={row.userId}
                  variant={row.userId === session.user.id ? "muted" : "outline"}
                  size="sm"
                >
                  <ItemContent>
                    <ItemTitle>
                      {row.rank === null ? "—" : `#${row.rank}`} {row.name}
                      {row.userId === session.user.id ? " (you)" : ""}
                    </ItemTitle>
                    <ItemDescription>
                      {row.dailyAverageMinutes === null
                        ? "Not submitted"
                        : `${formatScreenTime(row.dailyAverageMinutes)} per day`}
                    </ItemDescription>
                    {row.improvement !== null && (
                      <ItemDescription>
                        {row.improvement === 0
                          ? "No change"
                          : `${formatScreenTime(Math.abs(row.improvement))} ${row.improvement > 0 ? "less" : "more"} per day`}
                      </ItemDescription>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {bestImprovement > 0 &&
                        row.improvement === bestImprovement && (
                          <Badge variant="secondary">Most improved</Badge>
                        )}
                      {row.mediaId && (
                        <a
                          href={`/api/media/${row.mediaId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm underline underline-offset-4"
                          aria-label={`View ${row.name}'s screenshot`}
                        >
                          View screenshot
                        </a>
                      )}
                    </div>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
            <p className="text-sm text-muted-foreground">
              {submitted === 0
                ? "No submissions yet. Be the first to post this week."
                : "Missing submissions stay unranked. Screen time is a useful signal, not a measure of productivity."}
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {week === latest ? (
          <ScreenTimeUpload
            key={`${circleId}:${week}`}
            weekStart={week}
            circleId={circleId}
            submittedAverage={ownAverage}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>This week is archived</CardTitle>
              <CardDescription>
                Submissions open each Sunday for the week that just ended.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={href(latest)}
                className={buttonVariants({ variant: "outline" })}
              >
                <Smartphone data-icon="inline-start" />
                {latestSubmission ? "View latest week" : "Upload latest week"}
              </Link>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Your last 12 weeks</CardTitle>
            <CardDescription>
              Daily averages in this circle. Gaps mean no submission.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Week</TableHead>
                    <TableHead scope="col">Daily average</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 12 }, (_, index) => {
                    const start = shiftDateKey(latest, -7 * index);
                    const entry = history.find(
                      (row) =>
                        row.weekStart.toISOString().slice(0, 10) === start,
                    );
                    return (
                      <TableRow key={start}>
                        <TableCell>
                          <Link
                            href={href(start)}
                            className="underline underline-offset-4"
                          >
                            {screenTimeWeekLabel(start)}
                          </Link>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {entry
                            ? formatScreenTime(
                                entry.reading.dailyAverageMinutes,
                              )
                            : "Not submitted"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <ItemGroup className="md:hidden" aria-label="Your weekly history">
              {Array.from({ length: 12 }, (_, index) => {
                const start = shiftDateKey(latest, -7 * index);
                const entry = history.find(
                  (row) => row.weekStart.toISOString().slice(0, 10) === start,
                );
                return (
                  <Item key={start} size="sm">
                    <ItemContent>
                      <ItemTitle>
                        <Link
                          href={href(start)}
                          className="underline underline-offset-4"
                        >
                          {screenTimeWeekLabel(start)}
                        </Link>
                      </ItemTitle>
                      <ItemDescription>
                        {entry
                          ? `${formatScreenTime(entry.reading.dailyAverageMinutes)} per day`
                          : "Not submitted"}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                );
              })}
            </ItemGroup>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
