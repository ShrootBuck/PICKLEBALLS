import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Heart,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, PageSection } from "@/components/layout/page-header";
import { MediaGallery } from "@/components/media/media-gallery";
import { totalsParts } from "@/components/streaks/streak-text";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  DownloadWrapped,
  WeeklyWinEditor,
} from "@/components/wrapped/wrapped-actions";
import { DomainError } from "@/lib/errors";
import { bucketItemHref, postHref, streakHref } from "@/lib/navigation";
import { requirePageMembership } from "@/lib/request";
import { formatScreenTime } from "@/lib/screen-time";
import type { SocialAuthor } from "@/lib/social-types";
import { formatDayShort } from "@/lib/time";
import { shiftDateKey } from "@/lib/timeblocks";
import { getWrapped } from "@/lib/wrapped";

export const metadata: Metadata = { title: "Wrapped" };
function Person({ user }: { user: SocialAuthor }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar size="sm">
        <AvatarImage src={user.image ?? undefined} alt="" />
        <AvatarFallback>{user.initials}</AvatarFallback>
      </Avatar>
      <span className="truncate text-sm">{user.name}</span>
    </span>
  );
}
export default async function WrappedPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { session, membership } = await requirePageMembership();
  const { week: requested } = await searchParams;
  const recap = await getWrapped(
    membership.circleId,
    session.user.id,
    requested,
  ).catch((error) => {
    if (error instanceof DomainError) notFound();
    throw error;
  });
  const { week, circleId } = recap;
  const active =
    recap.totalVerified +
      recap.checkIns +
      recap.reviews +
      recap.milestones.length +
      recap.finishedGoals.length +
      recap.buckets.length +
      recap.screenTimeCount +
      recap.wins.length +
      recap.streakDays >
    0;
  const myWin = recap.wins.find((win) => win.userId === session.user.id);
  return (
    <>
      <PageHeader
        title="Your week, wrapped."
        description="The work, the wins, and the people who showed up."
        actions={<DownloadWrapped circleId={circleId} week={week.startKey} />}
      >
        <Sparkles className="size-4" />
        {recap.circleName}
      </PageHeader>
      <nav
        aria-label="Recap weeks"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-1">
          {week.startKey > recap.first && (
            <Link
              href={`/wrapped?week=${shiftDateKey(week.startKey, -7)}`}
              className={buttonVariants({ variant: "ghost", size: "icon" })}
              aria-label="Previous week"
            >
              <ChevronLeft />
            </Link>
          )}
          <p className="text-sm font-medium">{week.label}</p>
          {week.startKey < week.latest && (
            <Link
              href={`/wrapped?week=${shiftDateKey(week.startKey, 7)}`}
              className={buttonVariants({ variant: "ghost", size: "icon" })}
              aria-label="Next week"
            >
              <ChevronRight />
            </Link>
          )}
        </div>
        {week.startKey !== week.latest && (
          <Link
            href="/wrapped"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Latest week
          </Link>
        )}
      </nav>
      <section className="wrapped-hero" aria-label="Weekly recap">
        <div className="wrapped-orbits" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="relative flex flex-col gap-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">
              Pickleballs / Wrapped
            </span>
            <span className="text-xs">
              {formatDayShort(week.startKey)} to {formatDayShort(week.endKey)}
            </span>
          </div>
          <p className="max-w-lg text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {recap.totalVerified
              ? "Look what you made happen."
              : active
                ? "A week worth keeping."
                : "Your next chapter starts here."}
          </p>
          <div>
            <p className="wrapped-number">{recap.totalVerified}</p>
            <p className="mt-1 text-lg">
              {recap.totalVerified === 1 ? "promise kept." : "promises kept."}
            </p>
            <p className="mt-3 max-w-md text-sm opacity-80">
              {recap.participants
                ? `${recap.participants} ${recap.participants === 1 ? "person put" : "people put"} in the work. Your circle has the proof.`
                : "Every small step gives you something to look back on."}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-7 gap-y-3 border-t border-current/20 pt-5 text-sm">
            <a
              href="#milestones"
              className="underline-offset-4 hover:underline"
            >
              {recap.milestones.length} milestones
            </a>
            <a
              href="#week-details"
              className="underline-offset-4 hover:underline"
            >
              {recap.checkIns} check-ins
            </a>
            <a
              href="#week-details"
              className="underline-offset-4 hover:underline"
            >
              {recap.reviews} peer reviews
            </a>
            <a href="#streaks" className="underline-offset-4 hover:underline">
              {recap.streakDays} streak days
            </a>
          </div>
        </div>
      </section>
      {!active && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Sparkles />
            </EmptyMedia>
            <EmptyTitle>
              {week.startKey < recap.first
                ? "Your first recap is on its way"
                : "A quiet week"}
            </EmptyTitle>
            <EmptyDescription>
              {week.startKey < recap.first
                ? "A new recap opens each Sunday. Your circle's first full week will appear here."
                : "No activity recorded for this week. Try another week, or start making the next one worth remembering."}
            </EmptyDescription>
          </EmptyHeader>
          <Link
            href="/goals"
            className={buttonVariants({ variant: "outline" })}
          >
            Find your next goal
          </Link>
        </Empty>
      )}
      <PageSection
        title="The wins you chose"
        description="In your own words. Some progress doesn't fit a counter."
        action={
          week.startKey >= recap.first && (
            <WeeklyWinEditor
              key={`${week.startKey}:${myWin?.body ?? ""}`}
              circleId={circleId}
              week={week.startKey}
              initial={myWin?.body ?? ""}
            />
          )
        }
      >
        {recap.wins.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {recap.wins.map((win) => (
              <Card key={win.id}>
                <CardHeader>
                  <CardTitle>
                    <Person user={win.user} />
                  </CardTitle>
                  <CardDescription>Their win of the week</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap break-words leading-relaxed">
                    {win.body}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Be the first to share something you're proud of.
          </p>
        )}
      </PageSection>
      <section id="milestones" className="scroll-mt-6">
        <PageSection
          title="Closer to the bigger picture"
          description="Goal milestones and finish lines reached this week."
        >
          {recap.milestones.length +
            recap.finishedGoals.length +
            recap.buckets.length >
          0 ? (
            <div className="flex flex-col divide-y divide-border rounded-lg border px-4">
              {recap.finishedGoals.map((goal) => (
                <Link
                  href={`/goals/${goal.id}`}
                  key={`goal-${goal.id}`}
                  className="flex items-start gap-3 py-4"
                >
                  <Trophy className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold">
                      {goal.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {goal.user.name} completed a goal
                    </p>
                  </div>
                  <ArrowUpRight className="ml-auto size-4 shrink-0" />
                </Link>
              ))}
              {recap.milestones.map((milestone) => (
                <Link
                  href={`/goals/${milestone.goal.id}`}
                  key={milestone.id}
                  className="flex items-start gap-3 py-4"
                >
                  <Check className="mt-0.5 size-5 shrink-0 text-success" />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">
                      {milestone.title}
                    </p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {milestone.goal.user.name} / {milestone.goal.title}
                    </p>
                  </div>
                  <ArrowUpRight className="ml-auto size-4 shrink-0" />
                </Link>
              ))}
              {recap.buckets.map((item) => (
                <Link
                  key={item.id}
                  href={bucketItemHref(circleId, item.id)}
                  className="flex items-start gap-3 py-4"
                >
                  <Trophy className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The circle checked it off the bucket list
                    </p>
                  </div>
                  <ArrowUpRight className="ml-auto size-4 shrink-0" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No milestones checked off this week.{" "}
              <Link href="/goals" className="underline underline-offset-4">
                See what everyone is working toward.
              </Link>
            </p>
          )}
        </PageSection>
      </section>
      <section id="streaks" className="scroll-mt-6">
        <PageSection
          title="One day at a time"
          description="Circle streaks this week: days logged, totals, and milestones."
        >
          {recap.streaks.length ? (
            <div className="flex flex-col divide-y divide-border rounded-lg border px-4">
              {recap.streaks.map((item) => {
                const totals = totalsParts(item.kind, item, item.unitLabel);
                const best = Math.max(0, ...item.milestones);
                return (
                  <Link
                    key={item.id}
                    href={streakHref(circleId, item.id)}
                    className="flex items-center gap-3 py-4"
                  >
                    <span aria-hidden="true" className="text-xl">
                      {item.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.user.name} / {item.done} of {item.possible}{" "}
                        {item.kind === "QUIT" ? "days clean" : "days done"}
                        {totals.length ? `, ${totals.join(", ")}` : ""}
                      </p>
                    </div>
                    {best > 0 && (
                      <Badge variant="secondary">
                        <Flame data-icon="inline-start" />
                        {best} days
                      </Badge>
                    )}
                    <ArrowUpRight className="size-4 shrink-0" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No circle streaks this week.{" "}
              <Link href="/streaks" className="underline underline-offset-4">
                Start one and give it a day at a time.
              </Link>
            </p>
          )}
        </PageSection>
      </section>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>A little less screen time</CardTitle>
            <CardDescription>
              Largest drop in daily average from the previous week.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recap.mostImproved.length ? (
              <div className="flex flex-col gap-5">
                {recap.mostImproved.map((item) => (
                  <div key={item.user.id} className="flex flex-col gap-3">
                    <Person user={item.user} />
                    <p className="text-3xl font-semibold tracking-tight">
                      {formatScreenTime(item.minutes)} less
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        per day
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatScreenTime(item.previous)} →{" "}
                      {formatScreenTime(item.current)} ({item.percent}% lower)
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {recap.screenTimeCount
                  ? "No recorded drop from the previous week. Comparisons need a submission for both weeks."
                  : "No screen-time submissions for this week yet."}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Link
              href={`/screen-time?week=${week.startKey}`}
              className="text-sm underline underline-offset-4"
            >
              See the screen-time receipts
            </Link>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>A comment that landed</CardTitle>
            <CardDescription>
              A most-liked comment posted this week.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recap.topReply ? (
              <div className="flex flex-col gap-4">
                <Person user={recap.topReply.author} />
                <blockquote className="whitespace-pre-wrap break-words text-base leading-relaxed">
                  {recap.topReply.body}
                </blockquote>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Heart className="size-3.5" />
                  {recap.topReply.likes}{" "}
                  {recap.topReply.likes === 1 ? "like" : "likes"}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No liked comments this week. A little encouragement goes a long
                way.
              </p>
            )}
          </CardContent>
          {recap.topReply && (
            <CardFooter>
              <Link
                href={recap.topReply.href}
                className="text-sm underline underline-offset-4"
              >
                Back to the conversation
              </Link>
            </CardFooter>
          )}
        </Card>
      </div>
      <section id="proofs" className="scroll-mt-6">
        <PageSection
          title="You have the receipts"
          description={
            recap.totalVerified > 12
              ? `12 highlights from ${recap.totalVerified} verified tasks, ordered by likes.`
              : "Verified proof posted this week, ordered by likes."
          }
        >
          {recap.proofs.length ? (
            <div className="grid items-start gap-4 sm:grid-cols-2">
              {recap.proofs.map((proof) => (
                <Card key={proof.id}>
                  <CardHeader>
                    <CardTitle>
                      <Link
                        href={postHref(circleId, "proof", proof.id)}
                        className="underline-offset-4 hover:underline"
                      >
                        {proof.commitment.title}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      <Person user={proof.owner} />
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <MediaGallery
                      ids={proof.mediaIds}
                      legacyProofId={proof.image?.proofId}
                      compact
                    />
                    {proof.commitment.goal && (
                      <Link
                        href={`/goals/${proof.commitment.goal.id}`}
                        className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"
                      >
                        <Target className="size-3.5 shrink-0" />
                        {proof.commitment.goal.title}
                      </Link>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Link
                      href={postHref(circleId, "proof", proof.id)}
                      className="flex w-full items-center justify-between gap-2"
                    >
                      <Badge variant="success">Verified</Badge>
                      <span className="text-xs">
                        View proof <ArrowUpRight className="inline size-3.5" />
                      </span>
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Verified proof from this week will appear here.
            </p>
          )}
        </PageSection>
      </section>
      <section
        id="week-details"
        className="flex scroll-mt-6 flex-col gap-3 rounded-lg border p-5"
      >
        <h2 className="text-sm font-semibold">Behind the numbers</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Sunday through Saturday, Phoenix time. Promises kept counts unreplaced
          proof posted in this week that is now verified. Milestones are marked
          by their owners. Check-ins and peer reviews count posts made during
          the week. Streak days count logged days on circle streaks. Recaps
          update as reviews, streak logs, and screen-time submissions arrive.
        </p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 7 }, (_, index) =>
            shiftDateKey(week.startKey, index),
          ).map((day) => (
            <Link
              key={day}
              href={`/history?day=${day}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              {formatDayShort(day)}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
