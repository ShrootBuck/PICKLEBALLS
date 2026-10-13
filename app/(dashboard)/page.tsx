import { CheckCheck, Mountain, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { MoodLauncher } from "@/components/mood/mood-launcher";
import { StreakToday } from "@/components/streaks/streak-today";
import {
  type AttentionItem,
  AttentionList,
} from "@/components/today/attention-list";
import { GoalGlance } from "@/components/today/goal-glance";
import { TodaySummary } from "@/components/today/today-summary";
import { TodayTasks } from "@/components/today/today-tasks";
import { countBucketVotesAwaiting } from "@/lib/bucket-list-data";
import { getPrisma } from "@/lib/prisma";
import { getPageSession, requirePageMembership } from "@/lib/request";
import { latestScreenTimeWeek, screenTimeWeekLabel } from "@/lib/screen-time";
import { countProofsAwaitingVerdict } from "@/lib/social-data";
import { getStreaksNeedingLog } from "@/lib/streaks";
import {
  appTimeZone,
  formatDayLong,
  formatHistoryTime,
  phoenixDateKey,
  requireDateKey,
} from "@/lib/time";

export const metadata: Metadata = { title: "Today" };

function greeting(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: appTimeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const session = await getPageSession();
  if (!session) return <LandingPage />;
  const { membership } = await requirePageMembership();
  const userId = session.user.id;
  const circleId = membership.circleId;
  const day = phoenixDateKey();
  const screenWeek = latestScreenTimeWeek();
  const prisma = getPrisma();
  const [latest, streaks, verdicts, votes, screenTime, goals] =
    await Promise.all([
      prisma.checkInUpdate.findFirst({
        where: {
          userId,
          circleId,
          day: requireDateKey(day),
          valence: { not: null },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { valence: true, createdAt: true },
      }),
      getStreaksNeedingLog(circleId, userId),
      countProofsAwaitingVerdict(circleId, userId),
      countBucketVotesAwaiting(circleId, userId),
      prisma.screenTimeSubmission.findUnique({
        where: {
          userId_circleId_weekStart: {
            userId,
            circleId,
            weekStart: requireDateKey(screenWeek),
          },
        },
        select: { id: true },
      }),
      prisma.goal.findMany({
        where: { circleId, userId, status: "ACTIVE" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 3,
        select: {
          id: true,
          title: true,
          milestones: { select: { completedAt: true } },
          _count: { select: { tasks: { where: { status: "VERIFIED" } } } },
        },
      }),
    ]);
  const { focus } = await searchParams;
  const attention: AttentionItem[] = [];
  if (verdicts > 0)
    attention.push({
      key: "verdicts",
      href: "/squad",
      icon: CheckCheck,
      title: `${verdicts} ${verdicts === 1 ? "proof needs" : "proofs need"} your verdict`,
      description: "Your friends showed up. Approve or challenge their proof.",
    });
  if (votes > 0)
    attention.push({
      key: "votes",
      href: "/bucket-list",
      icon: Mountain,
      title: `${votes} bucket list ${votes === 1 ? "idea is" : "ideas are"} waiting on you`,
      description: "Say whether you’re in, or RSVP to a plan with a date.",
    });
  if (!screenTime)
    attention.push({
      key: "screen-time",
      href: "/screen-time#upload",
      icon: Smartphone,
      title: "Your weekly screen time is missing",
      description: `Your ${screenTimeWeekLabel(screenWeek)} entry is due. In Screen Time, choose Week, go back one week, and screenshot the average.`,
    });

  return (
    <>
      <TodaySummary
        greeting={greeting(new Date())}
        date={formatDayLong(day).replace(/, \d{4}$/, "")}
      />
      <div className="today-grid">
        <div className="today-column">
          <div className="today-slot">
            <TodayTasks
              focusId={
                typeof focus === "string" && focus.length <= 100
                  ? focus
                  : undefined
              }
            />
          </div>
        </div>
        <div className="today-column today-column-side">
          {attention.length > 0 && <AttentionList items={attention} />}
          {streaks.length > 0 && (
            <div className="today-slot">
              <StreakToday streaks={streaks} />
            </div>
          )}
          <div className="today-slot">
            <MoodLauncher
              latest={
                latest?.valence != null
                  ? {
                      valence: latest.valence,
                      time: formatHistoryTime(latest.createdAt),
                    }
                  : null
              }
            />
          </div>
          <div className="today-slot">
            <GoalGlance
              goals={goals.map((goal) => ({
                id: goal.id,
                title: goal.title,
                milestones: goal.milestones,
                verifiedTasks: goal._count.tasks,
              }))}
            />
          </div>
        </div>
      </div>
    </>
  );
}
