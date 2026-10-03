import { ArrowUpRight, Heart, MessageCircle, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDestination } from "@/components/circles/circle-destination";
import { PageSection } from "@/components/layout/page-header";
import { BackButton } from "@/components/social/back-button";
import { StreakCard } from "@/components/streaks/streak-card";
import {
  StreakHistoryList,
  StreakOwnerMenu,
} from "@/components/streaks/streak-detail";
import {
  milestoneSummary,
  totalsParts,
} from "@/components/streaks/streak-text";
import {
  StreakEmber,
  StreakHeatmap,
} from "@/components/streaks/streak-visuals";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { memberHref, postHref } from "@/lib/navigation";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";
import { getStreakDetail } from "@/lib/streaks";
import { formatCalendarDate } from "@/lib/time";

export const metadata: Metadata = { title: "Streak" };

export default async function StreakPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ circle?: string }>;
}) {
  const { session, membership } = await requirePageMembership();
  const { id } = await params;
  const query = await searchParams;
  if (id.length > 100) notFound();
  if (
    typeof query.circle === "string" &&
    query.circle !== membership.circleId
  ) {
    const allowed = await getPrisma().membership.findUnique({
      where: {
        userId_circleId: { userId: session.user.id, circleId: query.circle },
      },
    });
    if (!allowed) notFound();
    return (
      <CircleDestination
        circleId={query.circle}
        destination={`/streaks/${encodeURIComponent(id)}`}
      />
    );
  }
  const circleId = membership.circleId;
  const detail = await getStreakDetail(circleId, id, session.user.id);
  if (!detail) notFound();
  const { streak: view, days, history, events } = detail;
  const { summary } = view;
  const quit = view.kind === "QUIT";
  const allTime = totalsParts(view.kind, summary.allTime, view.unitLabel);
  const stats = [
    {
      label: quit ? "Days clean now" : "Days in a row",
      value: summary.current,
    },
    { label: "Longest run", value: summary.longest },
    {
      label: quit ? "Clean days in all" : "Days done in all",
      value: summary.totalDays,
    },
    quit
      ? {
          label: `Slips (${summary.slipsThisMonth} this month)`,
          value: summary.slips,
        }
      : { label: "Started", value: formatCalendarDate(view.startedAt) },
  ];
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <BackButton />
        {view.mine && <StreakOwnerMenu view={view} />}
      </div>
      <Link
        href={
          view.mine
            ? "/profile?tab=streaks"
            : memberHref(circleId, view.owner.id, "streaks")
        }
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <Avatar size="sm">
          <AvatarImage src={view.owner.image ?? undefined} alt="" />
          <AvatarFallback>{view.owner.initials}</AvatarFallback>
        </Avatar>
        {view.mine ? "Your" : `${view.owner.name}’s`} {quit ? "quit" : "build"}{" "}
        streak, started {formatCalendarDate(view.startedAt)}
      </Link>
      <StreakCard view={view} size="hero" />
      <section
        aria-label="Statistics"
        className="grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border p-4">
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </section>
      {allTime.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">All time:</span>{" "}
          <span className="font-medium">{allTime.join(", ")}</span>
        </p>
      )}
      <PageSection
        title="The last six months"
        description="Every square is a day. Hover or long-press one to see it."
      >
        <StreakHeatmap
          days={days}
          today={summary.today}
          kind={view.kind}
          unitLabel={view.unitLabel}
        />
      </PageSection>
      {view.visibility === "CIRCLE" && events.length > 0 && (
        <PageSection
          title="Milestones"
          description="Posted to your circle’s feed."
        >
          <ul className="flex flex-col divide-y rounded-lg border">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={postHref(circleId, "streak", event.id)}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  {event.kind === "MILESTONE" ? (
                    <StreakEmber count={event.count} size={32} />
                  ) : (
                    <Trophy className="size-5 text-primary" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {event.kind === "MILESTONE"
                        ? milestoneSummary(view.kind, event.count)
                        : "Retired"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatCalendarDate(event.createdAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Heart className="size-3.5" />
                      {event.likes}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="size-3.5" />
                      {event.comments}
                    </span>
                    <ArrowUpRight className="size-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </PageSection>
      )}
      <PageSection
        title="History"
        description={
          view.mine && view.status === "ACTIVE"
            ? "Entries can be undone until the end of the next day."
            : undefined
        }
      >
        <StreakHistoryList view={view} history={history} />
      </PageSection>
    </>
  );
}
