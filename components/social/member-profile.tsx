import { CalendarDays, CheckSquare, Image, Smartphone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDestination } from "@/components/circles/circle-destination";
import { Feed } from "@/components/social/feed";
import { AddTaskButton } from "@/components/social/home-actions";
import { ProfileDayPicker } from "@/components/social/profile-day-picker";
import { ProfileMenu } from "@/components/social/profile-menu";
import { TaskList } from "@/components/social/task-list";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";
import {
  formatScreenTime,
  latestScreenTimeWeek,
  screenTimeWeekLabel,
} from "@/lib/screen-time";
import {
  getFeedPage,
  socialTaskInclude,
  toSocialTask,
} from "@/lib/social-data";
import {
  formatDayShort,
  parseDateKey,
  phoenixDateKey,
  phoenixWallToDate,
  requireDateKey,
} from "@/lib/time";
import { shiftDateKey } from "@/lib/timeblocks";

export type ProfileParams = {
  tab?: string;
  day?: string;
  circle?: string;
  focus?: string;
};
export async function MemberProfile({
  userId,
  params,
}: {
  userId?: string;
  params: ProfileParams;
}) {
  const { session, membership } = await requirePageMembership();
  const id = userId ?? session.user.id;
  const mine = id === session.user.id;
  const base = mine ? "/profile" : `/members/${encodeURIComponent(id)}`;
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
    const query = new URLSearchParams({ circle: params.circle });
    for (const name of ["tab", "day", "focus"] as const)
      if (typeof params[name] === "string") query.set(name, params[name]);
    return (
      <CircleDestination
        circleId={params.circle}
        destination={`${base}?${query}`}
      />
    );
  }
  const circleId = membership.circleId;
  const subject = await getPrisma().membership.findUnique({
    where: { userId_circleId: { userId: id, circleId } },
    include: { user: true },
  });
  if (!subject) notFound();
  const today = phoenixDateKey();
  const day =
    typeof params.day === "string" &&
    parseDateKey(params.day) &&
    params.day <= today
      ? params.day
      : today;
  const tab = params.tab === "tasks" ? "tasks" : "posts";
  const monday = shiftDateKey(
    today,
    -((requireDateKey(today).getUTCDay() + 6) % 7),
  );
  const nextMonday = shiftDateKey(monday, 7);
  const screenWeek = latestScreenTimeWeek();
  const [feed, tasks, weeklyTasks, verdicts, screenTime] = await Promise.all([
    tab === "posts"
      ? getFeedPage({ viewerId: session.user.id, circleId, memberId: id })
      : null,
    tab === "tasks"
      ? getPrisma().commitment.findMany({
          where: { userId: id, circleId, day: requireDateKey(day) },
          orderBy: { createdAt: "asc" },
          include: socialTaskInclude,
        })
      : [],
    getPrisma().commitment.findMany({
      where: {
        userId: id,
        circleId,
        day: { gte: requireDateKey(monday), lt: requireDateKey(nextMonday) },
      },
      include: socialTaskInclude,
    }),
    getPrisma().taskProofReview.count({
      where: {
        reviewerId: id,
        circleId,
        createdAt: {
          gte: phoenixWallToDate(monday, 0, 0, 0, 0) ?? undefined,
          lt: phoenixWallToDate(nextMonday, 0, 0, 0, 0) ?? undefined,
        },
      },
    }),
    getPrisma().screenTimeSubmission.findUnique({
      where: {
        userId_circleId_weekStart: {
          userId: id,
          circleId,
          weekStart: requireDateKey(screenWeek),
        },
      },
      select: { reading: { select: { dailyAverageMinutes: true } } },
    }),
  ]);
  const stats = weeklyTasks.map(toSocialTask);
  const profileQuery = new URLSearchParams({ circle: circleId });
  const taskQuery = new URLSearchParams({
    circle: circleId,
    tab: "tasks",
    day,
  });
  return (
    <>
      <header className="flex items-start gap-4">
        <Avatar className="size-20">
          <AvatarImage src={subject.user.image ?? undefined} alt="" />
          <AvatarFallback>{subject.user.initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {subject.user.name}
            </h1>
            {mine && <ProfileMenu isOwner={membership.role === "OWNER"} />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {membership.circle.name}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" />
            Joined {formatDayShort(phoenixDateKey(subject.createdAt))}
          </p>
        </div>
      </header>
      <section aria-label="This week’s statistics">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">This week</h2>
          <span className="text-xs text-muted-foreground">
            {formatDayShort(monday)} · Phoenix
          </span>
        </div>
        <div className="profile-stats">
          {[
            {
              label: "Tasks verified",
              value: stats.filter((t) => t.status === "VERIFIED").length,
            },
            {
              label: "Tasks missed",
              value: stats.filter((t) => t.status === "MISSED").length,
            },
            { label: "Verdicts given", value: verdicts },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="profile-stat-number">{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
        <Link
          href={`/screen-time?week=${screenWeek}`}
          className="mt-4 flex items-start gap-3 text-sm"
        >
          <Smartphone className="mt-0.5 size-4 text-muted-foreground" />
          <span>
            <span className="font-medium">
              {screenTime
                ? `${formatScreenTime(screenTime.reading.dailyAverageMinutes)} / day`
                : "Screen time not submitted"}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {screenTimeWeekLabel(screenWeek)} · latest completed week
            </span>
          </span>
        </Link>
      </section>
      <nav className="flex border-b" aria-label="Profile sections">
        <Link
          className="profile-tab"
          href={`${base}?${profileQuery}`}
          aria-current={tab === "posts" ? "page" : undefined}
        >
          <Image className="size-4" />
          Posts
        </Link>
        <Link
          className="profile-tab"
          href={`${base}?${taskQuery}`}
          aria-current={tab === "tasks" ? "page" : undefined}
        >
          <CheckSquare className="size-4" />
          Tasks
        </Link>
      </nav>
      {tab === "posts" && feed ? (
        <Feed key={`${id}:posts`} memberId={id} initial={feed} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ProfileDayPicker
              base={base}
              circleId={circleId}
              day={day}
              today={today}
            />
            {mine && day === today && <AddTaskButton />}
          </div>
          {day === today && (
            <p className="text-xs text-muted-foreground">
              Due tonight at midnight, Phoenix time.
            </p>
          )}
          <TaskList
            key={`${id}:${day}`}
            tasks={tasks.map(toSocialTask)}
            mine={mine && day === today}
            focusId={
              typeof params.focus === "string" ? params.focus : undefined
            }
          />
        </>
      )}
    </>
  );
}
