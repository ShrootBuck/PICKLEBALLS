import { ChevronLeft, ChevronRight, Smartphone, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDestination } from "@/components/circles/circle-destination";
import { PageHeader } from "@/components/layout/page-header";
import { ScreenTimeUpload } from "@/components/screen-time/upload";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { memberHref } from "@/lib/navigation";
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
      select: {
        userId: true,
        user: { select: { name: true, image: true, initials: true } },
      },
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
        title="A little less scrolling."
        description="Make more room for everything else. Your circle’s weekly screen time."
      />
      <nav
        aria-label="Screen time weeks"
        className="flex items-center justify-between gap-3"
      >
        <Link
          href={href(previous)}
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          aria-label="Previous week"
        >
          <ChevronLeft />
        </Link>
        <div className="text-center">
          <h2 className="text-sm font-semibold">{screenTimeWeekLabel(week)}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {submitted}/{members.length} submitted · iPhone screen time
          </p>
        </div>
        {week < latest ? (
          <Link
            href={href(shiftDateKey(week, 7))}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Next week"
          >
            <ChevronRight />
          </Link>
        ) : (
          <span className="size-9" />
        )}
      </nav>
      <section aria-label="Weekly leaderboard" className="flex flex-col">
        {standings.map((row) => {
          const person = members.find(
            (member) => member.userId === row.userId,
          )?.user;
          return (
            <article
              key={row.userId}
              className="screen-time-row"
              data-mine={row.userId === session.user.id || undefined}
            >
              <span className="w-6 shrink-0 text-center text-sm tabular-nums text-muted-foreground">
                {row.rank === 1 ? (
                  <Trophy
                    className="size-5 text-primary"
                    aria-label="First place"
                  />
                ) : (
                  (row.rank ?? "·")
                )}
              </span>
              <Link
                href={memberHref(circleId, row.userId)}
                aria-label={`${row.name}’s profile`}
              >
                <Avatar className="size-11">
                  <AvatarImage src={person?.image ?? undefined} alt="" />
                  <AvatarFallback>{person?.initials ?? "PB"}</AvatarFallback>
                </Avatar>
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href={memberHref(circleId, row.userId)}
                  className="text-sm font-semibold"
                >
                  {row.name}
                  {row.userId === session.user.id ? " (you)" : ""}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.improvement === null
                    ? "No previous week to compare"
                    : row.improvement === 0
                      ? "Same as last week"
                      : `${formatScreenTime(Math.abs(row.improvement))} ${row.improvement > 0 ? "less" : "more"} / day`}
                </p>
                {bestImprovement > 0 && row.improvement === bestImprovement && (
                  <Badge variant="secondary" className="mt-2">
                    Most improved
                  </Badge>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p className="text-sm font-semibold tabular-nums">
                  {row.dailyAverageMinutes === null
                    ? "Not submitted"
                    : formatScreenTime(row.dailyAverageMinutes)}
                </p>
                {row.mediaId ? (
                  <a
                    href={`/api/media/${row.mediaId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground underline underline-offset-4"
                    aria-label={`View ${row.name}’s screenshot`}
                  >
                    Screenshot
                  </a>
                ) : (
                  row.userId === session.user.id &&
                  week === latest && (
                    <Link
                      href="#upload"
                      className="text-xs text-primary underline"
                    >
                      Add yours
                    </Link>
                  )
                )}
              </div>
            </article>
          );
        })}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Lowest daily average first. Equal times share a rank. Missing
          submissions stay unranked. Screen time is a signal, not a productivity
          score.
        </p>
      </section>
      <div className="grid min-w-0 items-start gap-8 lg:grid-cols-2">
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
        <section>
          <h2 className="text-base font-semibold">Your last 12 weeks</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            A little perspective on the habit.
          </p>
          {Array.from({ length: 12 }, (_, index) => {
            const start = shiftDateKey(latest, -7 * index);
            const entry = history.find(
              (row) => row.weekStart.toISOString().slice(0, 10) === start,
            );
            return (
              <Link
                key={start}
                href={href(start)}
                className="flex items-center justify-between gap-3 border-b py-3 text-sm"
              >
                <span className="text-muted-foreground">
                  {screenTimeWeekLabel(start)}
                </span>
                <span className="tabular-nums">
                  {entry
                    ? formatScreenTime(entry.reading.dailyAverageMinutes)
                    : "Not submitted"}
                </span>
              </Link>
            );
          })}
        </section>
      </div>
    </>
  );
}
