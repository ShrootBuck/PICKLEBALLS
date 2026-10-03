import { Flame } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDestination } from "@/components/circles/circle-destination";
import { PageHeader, PageSection } from "@/components/layout/page-header";
import { StreakCard } from "@/components/streaks/streak-card";
import { StreakForm } from "@/components/streaks/streak-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { memberHref } from "@/lib/navigation";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";
import { getStreakBoard } from "@/lib/streaks";

export const metadata: Metadata = { title: "Streaks" };

export default async function StreaksPage({
  searchParams,
}: {
  searchParams: Promise<{ circle?: string }>;
}) {
  const { session, membership } = await requirePageMembership();
  const params = await searchParams;
  if (
    typeof params.circle === "string" &&
    params.circle !== membership.circleId
  ) {
    const allowed = await getPrisma().membership.findUnique({
      where: {
        userId_circleId: { userId: session.user.id, circleId: params.circle },
      },
    });
    if (!allowed) notFound();
    return (
      <CircleDestination circleId={params.circle} destination="/streaks" />
    );
  }
  const circleId = membership.circleId;
  const board = await getStreakBoard(circleId, session.user.id);
  return (
    <>
      <PageHeader
        title="One honest day at a time."
        description="Quit something or build something. Log it every day, and let your circle cheer you on."
        actions={<StreakForm circleId={circleId} openFromLink />}
      >
        <Flame className="size-4" />
        Streaks
      </PageHeader>
      <PageSection
        title="Your streaks"
        description="Each day counts once it’s logged. Miss a day’s window and the count starts over."
      >
        {board.mine.length ? (
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {board.mine.map((view) => (
              <StreakCard key={view.id} view={view} />
            ))}
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Flame />
              </EmptyMedia>
              <EmptyTitle>What do you want to quit or build?</EmptyTitle>
              <EmptyDescription>
                Quit caffeine, read every day, or anything in between. Start a
                streak and give it one honest check-in a day.
              </EmptyDescription>
            </EmptyHeader>
            <StreakForm circleId={circleId} />
          </Empty>
        )}
      </PageSection>
      <PageSection
        title="Your circle"
        description="Not a leaderboard. Just the people in your corner."
      >
        {board.circle.length ? (
          <div className="flex flex-col gap-6">
            {board.circle.map(({ member, streaks }) => (
              <div key={member.id} className="flex flex-col gap-3">
                <Link
                  href={memberHref(circleId, member.id, "streaks")}
                  className="flex w-fit items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
                >
                  <Avatar size="sm">
                    <AvatarImage src={member.image ?? undefined} alt="" />
                    <AvatarFallback>{member.initials}</AvatarFallback>
                  </Avatar>
                  {member.name}
                </Link>
                <div className="grid items-start gap-4 sm:grid-cols-2">
                  {streaks.map((view) => (
                    <StreakCard key={view.id} view={view} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No one else in your circle has a streak going yet.
          </p>
        )}
      </PageSection>
      <section className="flex flex-col gap-2 rounded-lg border p-5 text-xs leading-relaxed text-muted-foreground">
        <h2 className="text-sm font-semibold text-foreground">
          How streaks work
        </h2>
        <p>
          Quit streaks: a day counts once it’s over. Confirm it the next day,
          before midnight. Log a slip whenever it happens. Your count starts
          over, but your history and all-time totals stay.
        </p>
        <p>
          Build streaks: log any time during the day, as often as you like, and
          amounts add up. Yesterday stays open until midnight.
        </p>
        <p>
          If a day still has nothing logged when the next day ends, the streak
          resets. Circle streaks post their start, milestones (7, 30, 60, 100,
          180, and 365 days), and retirement to the feed. Days follow Phoenix
          time.
        </p>
      </section>
    </>
  );
}
