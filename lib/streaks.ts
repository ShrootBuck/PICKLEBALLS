import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/lib/errors";
import { streakHref } from "@/lib/navigation";
import {
  createNotificationAndPush,
  getNotificationPrefsByUser,
  withNotifications,
} from "@/lib/notifications";
import { getPrisma } from "@/lib/prisma";
import { socialAuthorSelect } from "@/lib/social-data";
import {
  createStreakSchema,
  crossedMilestones,
  isEntryDayOpen,
  type StreakSummary,
  type StreakView,
  slipWindow,
  streakActionSchema,
  streakActions,
  streakAmountError,
  streakEntrySchema,
  streakHistory,
  summarizeStreak,
  toCardSummary,
} from "@/lib/streak-policy";
import {
  parsePhoenixLocalDateTime,
  phoenixDateKey,
  phoenixHour,
  requireDateKey,
} from "@/lib/time";
import { shiftDateKey } from "@/lib/timeblocks";
import { serializable } from "@/lib/transaction";

const entrySelect = {
  id: true,
  day: true,
  kind: true,
  occurredAt: true,
  costCents: true,
  units: true,
  note: true,
} as const;

function streakInclude(viewerId: string, now: Date) {
  return {
    user: { select: socialAuthorSelect },
    entries: {
      select: entrySelect,
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    },
    nudges: {
      where: { senderId: viewerId, day: requireDateKey(phoenixDateKey(now)) },
      select: { senderId: true },
    },
  } satisfies Prisma.StreakInclude;
}

type StreakRow = Prisma.StreakGetPayload<{
  include: ReturnType<typeof streakInclude>;
}>;

const dayKey = (day: Date) => day.toISOString().slice(0, 10);
const days = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

function toStreakView(
  row: StreakRow,
  viewerId: string,
  summary: StreakSummary,
): StreakView {
  return {
    id: row.id,
    circleId: row.circleId,
    title: row.title,
    emoji: row.emoji,
    kind: row.kind,
    visibility: row.visibility,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    retiredAt: row.retiredAt?.toISOString() ?? null,
    dailyCostCents: row.dailyCostCents,
    dailyUnits: row.dailyUnits,
    unitLabel: row.unitLabel,
    owner: row.user,
    mine: row.userId === viewerId,
    nudged: row.nudges.length > 0,
    summary: toCardSummary(summary),
  };
}

async function requireMember(
  tx: Prisma.TransactionClient,
  userId: string,
  circleId: string,
) {
  if (
    !(await tx.membership.findUnique({
      where: { userId_circleId: { userId, circleId } },
    }))
  )
    throw new DomainError("You are no longer in this circle.", 403);
}

// Private streaks are indistinguishable from missing ones for everyone else.
async function loadOwnStreak(
  tx: Prisma.TransactionClient,
  streakId: string,
  userId: string,
  circleId: string,
) {
  const streak = await tx.streak.findFirst({
    where: { id: streakId, circleId },
    include: {
      entries: {
        select: entrySelect,
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!streak || (streak.visibility === "PRIVATE" && streak.userId !== userId))
    throw new DomainError("Streak not found.", 404);
  if (streak.userId !== userId)
    throw new DomainError(
      "Only the person keeping this streak can change it.",
      403,
    );
  return streak;
}

function firstIssue(
  result: { error?: { issues: { message: string }[] } },
  fallback: string,
) {
  return result.error?.issues[0]?.message ?? fallback;
}

export async function createStreak(
  userId: string,
  circleId: string,
  input: unknown,
  now = new Date(),
) {
  const parsed = createStreakSchema.safeParse(input);
  if (!parsed.success)
    throw new DomainError(firstIssue(parsed, "Check the streak fields."));
  const { circleId: requested, ...data } = parsed.data;
  if (requested !== circleId)
    throw new DomainError("Your circle changed. Refresh and try again.", 409);
  return serializable(async (tx) => {
    await requireMember(tx, userId, circleId);
    const streak = await tx.streak.create({
      data: { ...data, userId, circleId, startedAt: now },
    });
    if (streak.visibility === "CIRCLE") {
      await tx.streakEvent.create({
        data: {
          streakId: streak.id,
          userId,
          circleId,
          kind: "STARTED",
          count: 0,
          dedupeKey: "started",
          createdAt: now,
        },
      });
      await tx.activityEvent.create({
        data: {
          circleId,
          actorId: userId,
          kind: "STREAK_STARTED",
          entityId: streak.id,
          summary: `started a streak: ${streak.emoji} ${streak.title}`,
        },
      });
    }
    return streak;
  });
}

export async function changeStreak(
  streakId: string,
  userId: string,
  circleId: string,
  input: unknown,
  now = new Date(),
) {
  const parsed = streakActionSchema.safeParse(input);
  if (!parsed.success)
    throw new DomainError(firstIssue(parsed, "Check the streak fields."));
  const action = parsed.data;
  return serializable(async (tx) => {
    await requireMember(tx, userId, circleId);
    const streak = await loadOwnStreak(tx, streakId, userId, circleId);
    const { entries, ...current } = streak;
    if (streak.status === "RETIRED") {
      if (action.action === "retire") return current;
      throw new DomainError("Retired streaks can’t be changed.", 409);
    }
    if (action.action === "details") {
      const { action: _action, ...details } = action;
      const message = streakAmountError(details, streak.kind);
      if (message) throw new DomainError(message);
      return tx.streak.update({ where: { id: streak.id }, data: details });
    }
    const summary = summarizeStreak(streak, entries, now);
    const retired = await tx.streak.update({
      where: { id: streak.id },
      data: { status: "RETIRED", retiredAt: now },
    });
    if (streak.visibility === "CIRCLE") {
      await tx.streakEvent.create({
        data: {
          streakId: streak.id,
          userId,
          circleId,
          kind: "RETIRED",
          count: summary.current,
          costCents: summary.allTime.costCents || null,
          units: summary.allTime.units || null,
          dedupeKey: "retired",
          createdAt: now,
        },
      });
      await tx.activityEvent.create({
        data: {
          circleId,
          actorId: userId,
          kind: "STREAK_RETIRED",
          entityId: streak.id,
          summary: `retired ${streak.emoji} ${streak.title} after ${days(summary.current)}`,
        },
      });
    }
    return retired;
  });
}

export async function deleteStreak(
  streakId: string,
  userId: string,
  circleId: string,
) {
  return serializable(async (tx) => {
    const streak = await loadOwnStreak(tx, streakId, userId, circleId);
    await tx.streak.delete({ where: { id: streak.id } });
    return { id: streak.id };
  });
}

export async function addStreakEntry(
  streakId: string,
  userId: string,
  circleId: string,
  input: unknown,
  now = new Date(),
) {
  const parsed = streakEntrySchema.safeParse(input);
  if (!parsed.success)
    throw new DomainError(firstIssue(parsed, "Check your entry."));
  const action = parsed.data;
  return serializable(async (tx) => {
    await requireMember(tx, userId, circleId);
    const streak = await loadOwnStreak(tx, streakId, userId, circleId);
    if (streak.status !== "ACTIVE")
      throw new DomainError("This streak is retired.", 409);
    const before = summarizeStreak(streak, streak.entries, now);
    const note = action.note || null;
    let entries = streak.entries;
    if (action.action === "clean") {
      if (streak.kind !== "QUIT")
        throw new DomainError("Build streaks are logged, not confirmed.");
      if (action.day >= before.today)
        throw new DomainError("You can confirm a day once it’s over.", 409);
      if (action.day !== before.yesterday || action.day < before.startDay)
        throw new DomainError("That day can no longer be changed.", 409);
      const sameDay = entries.filter((item) => dayKey(item.day) === action.day);
      if (sameDay.some((item) => item.kind === "SLIP"))
        throw new DomainError("You logged a slip that day.", 409);
      const existing = sameDay.find((item) => item.kind === "CLEAN");
      if (existing)
        return {
          entry: existing,
          summary: toCardSummary(before),
          milestone: null,
        };
      const entry = await tx.streakEntry.create({
        data: {
          streakId: streak.id,
          day: requireDateKey(action.day),
          kind: "CLEAN",
          occurredAt: now,
          costCents: streak.dailyCostCents,
          units: streak.dailyUnits,
          note,
        },
        select: entrySelect,
      });
      entries = [...entries, entry];
    } else if (action.action === "slip") {
      if (streak.kind !== "QUIT")
        throw new DomainError(
          "Build streaks can’t slip. Log the days you do it.",
        );
      const chosen = action.occurredAt
        ? parsePhoenixLocalDateTime(action.occurredAt)
        : now;
      if (!chosen) throw new DomainError("Choose a valid time.");
      const window = slipWindow(streak.startedAt, now);
      // datetime-local inputs have minute precision, so allow the current minute.
      if (chosen.getTime() > now.getTime() + 60_000)
        throw new DomainError("That time hasn’t happened yet.");
      if (chosen.getTime() < window.min.getTime() - 60_000)
        throw new DomainError(
          "Slips can be logged for yesterday or today, after the streak started.",
          409,
        );
      const occurredAt = new Date(
        Math.min(
          now.getTime(),
          Math.max(chosen.getTime(), window.min.getTime()),
        ),
      );
      const day = phoenixDateKey(occurredAt);
      // An honest slip replaces an earlier clean confirmation for that day.
      await tx.streakEntry.deleteMany({
        where: { streakId: streak.id, kind: "CLEAN", day: requireDateKey(day) },
      });
      const entry = await tx.streakEntry.create({
        data: {
          streakId: streak.id,
          day: requireDateKey(day),
          kind: "SLIP",
          occurredAt,
          note,
        },
        select: entrySelect,
      });
      entries = [
        ...entries.filter(
          (item) => !(item.kind === "CLEAN" && dayKey(item.day) === day),
        ),
        entry,
      ];
    } else {
      if (streak.kind !== "BUILD")
        throw new DomainError("Quit streaks are confirmed once a day ends.");
      if (
        (action.day !== before.today && action.day !== before.yesterday) ||
        action.day < before.startDay
      )
        throw new DomainError("You can log today or yesterday.", 409);
      const entry = await tx.streakEntry.create({
        data: {
          streakId: streak.id,
          day: requireDateKey(action.day),
          kind: "LOG",
          occurredAt: now,
          units: streak.unitLabel ? (action.units ?? streak.dailyUnits) : null,
          note,
        },
        select: entrySelect,
      });
      entries = [...entries, entry];
    }
    const after = summarizeStreak(streak, entries, now);
    const milestones = crossedMilestones(before.settled, after.settled);
    if (streak.visibility === "CIRCLE" && milestones.length) {
      const keys = new Map(
        milestones.map((count) => [
          count,
          `milestone:${count}:${after.runStartDay}`,
        ]),
      );
      const posted = new Set(
        (
          await tx.streakEvent.findMany({
            where: {
              streakId: streak.id,
              dedupeKey: { in: [...keys.values()] },
            },
            select: { dedupeKey: true },
          })
        ).map((event) => event.dedupeKey),
      );
      for (const [count, dedupeKey] of keys) {
        if (posted.has(dedupeKey)) continue;
        await tx.streakEvent.create({
          data: {
            streakId: streak.id,
            userId,
            circleId,
            kind: "MILESTONE",
            count,
            costCents: after.run.costCents || null,
            units: after.run.units || null,
            dedupeKey,
            createdAt: now,
          },
        });
        await tx.activityEvent.create({
          data: {
            circleId,
            actorId: userId,
            kind: "STREAK_MILESTONE",
            entityId: streak.id,
            summary: `hit ${days(count)} on ${streak.emoji} ${streak.title}`,
          },
        });
      }
    }
    return {
      entry: entries.at(-1),
      summary: toCardSummary(after),
      milestone: milestones.at(-1) ?? null,
    };
  });
}

export async function removeStreakEntry(
  streakId: string,
  entryId: string,
  userId: string,
  circleId: string,
  now = new Date(),
) {
  return serializable(async (tx) => {
    await requireMember(tx, userId, circleId);
    const streak = await loadOwnStreak(tx, streakId, userId, circleId);
    if (streak.status !== "ACTIVE")
      throw new DomainError("Retired streaks can’t be changed.", 409);
    const entry = streak.entries.find((item) => item.id === entryId);
    if (!entry) throw new DomainError("Entry not found.", 404);
    if (!isEntryDayOpen(dayKey(entry.day), now))
      throw new DomainError(
        "That day is locked in. Entries can be undone until the end of the next day.",
        409,
      );
    await tx.streakEntry.delete({ where: { id: entry.id } });
    return { id: entry.id };
  });
}

export async function nudgeStreak(
  streakId: string,
  senderId: string,
  circleId: string,
  now = new Date(),
) {
  return withNotifications(async (tx, notifications) => {
    await requireMember(tx, senderId, circleId);
    const streak = await tx.streak.findFirst({
      where: { id: streakId, circleId, visibility: "CIRCLE" },
      include: { entries: { select: entrySelect } },
    });
    if (!streak) throw new DomainError("Streak not found.", 404);
    if (streak.userId === senderId)
      throw new DomainError("You can’t nudge yourself. Log it instead.");
    if (streak.status !== "ACTIVE")
      throw new DomainError("This streak is retired.", 409);
    await requireMember(tx, streak.userId, circleId).catch(() => {
      throw new DomainError("Streak not found.", 404);
    });
    const summary = summarizeStreak(streak, streak.entries, now);
    if (summary.yesterdayState !== "pending")
      throw new DomainError(
        "They’re caught up. There’s nothing to nudge about right now.",
        409,
      );
    const created = await tx.streakNudge.createMany({
      data: [{ streakId, senderId, day: requireDateKey(summary.today) }],
      skipDuplicates: true,
    });
    if (!created.count) return { nudged: true };
    const sender = await tx.user.findUnique({
      where: { id: senderId },
      select: { name: true },
    });
    await createNotificationAndPush(
      {
        recipientId: streak.userId,
        actorId: senderId,
        circleId,
        kind: "STREAK_NUDGE",
        entityId: streak.id,
        title: `${sender?.name ?? "A friend"} nudged you about ${streak.emoji} ${streak.title}`,
        body:
          streak.kind === "QUIT"
            ? "Was yesterday clean? Confirm it before midnight to keep your streak."
            : "Log yesterday before midnight to keep your streak.",
        data: { url: streakHref(circleId, streak.id) },
        dedupeKey: `streak-nudge:${streak.id}:${senderId}:${summary.today}`,
      },
      notifications,
    );
    return { nudged: true };
  });
}

function visibleTo(viewerId: string) {
  return { OR: [{ visibility: "CIRCLE" as const }, { userId: viewerId }] };
}

export async function getStreakBoard(
  circleId: string,
  viewerId: string,
  now = new Date(),
) {
  const prisma = getPrisma();
  await requireMember(prisma, viewerId, circleId);
  const [rows, members] = await Promise.all([
    prisma.streak.findMany({
      where: {
        circleId,
        status: "ACTIVE",
        ...visibleTo(viewerId),
        user: { memberships: { some: { circleId } } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: streakInclude(viewerId, now),
    }),
    prisma.membership.findMany({
      where: { circleId, userId: { not: viewerId } },
      orderBy: { createdAt: "asc" },
      select: { user: { select: socialAuthorSelect } },
    }),
  ]);
  const views = rows.map((row) =>
    toStreakView(row, viewerId, summarizeStreak(row, row.entries, now)),
  );
  return {
    mine: views.filter((view) => view.mine),
    circle: members
      .map(({ user }) => ({
        member: user,
        streaks: views.filter((view) => view.owner.id === user.id),
      }))
      .filter((group) => group.streaks.length > 0),
  };
}

// Your own streaks that still need a log today or yesterday.
export async function getStreaksNeedingLog(
  circleId: string,
  viewerId: string,
  now = new Date(),
) {
  const rows = await getPrisma().streak.findMany({
    where: { circleId, userId: viewerId, status: "ACTIVE" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: streakInclude(viewerId, now),
  });
  return rows
    .map((row) =>
      toStreakView(row, viewerId, summarizeStreak(row, row.entries, now)),
    )
    .filter((view) => streakActions(view, view.summary).needsLog);
}

export async function getMemberStreaks(
  circleId: string,
  memberId: string,
  viewerId: string,
  now = new Date(),
) {
  const rows = await getPrisma().streak.findMany({
    where: {
      circleId,
      userId: memberId,
      ...(memberId === viewerId ? {} : { visibility: "CIRCLE" as const }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: streakInclude(viewerId, now),
  });
  const views = rows.map((row) =>
    toStreakView(row, viewerId, summarizeStreak(row, row.entries, now)),
  );
  return {
    active: views.filter((view) => view.status === "ACTIVE"),
    retired: views.filter((view) => view.status === "RETIRED"),
  };
}

export async function getStreakDetail(
  circleId: string,
  streakId: string,
  viewerId: string,
  now = new Date(),
) {
  const prisma = getPrisma();
  await requireMember(prisma, viewerId, circleId);
  const row = await prisma.streak.findFirst({
    where: {
      id: streakId,
      circleId,
      ...visibleTo(viewerId),
      user: { memberships: { some: { circleId } } },
    },
    include: {
      ...streakInclude(viewerId, now),
      events: {
        where: { kind: { not: "STARTED" } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          kind: true,
          count: true,
          createdAt: true,
          _count: { select: { likes: true, replies: true } },
        },
      },
    },
  });
  if (!row) return null;
  const summary = summarizeStreak(row, row.entries, now);
  const mine = row.userId === viewerId;
  return {
    streak: toStreakView(row, viewerId, summary),
    days: summary.days.map(({ day, state, units }) => ({ day, state, units })),
    history: streakHistory(summary, row.entries, {
      canUndo: mine && row.status === "ACTIVE",
    }),
    events: row.events.map((event) => ({
      id: event.id,
      kind: event.kind,
      count: event.count,
      createdAt: event.createdAt.toISOString(),
      likes: event._count.likes,
      comments: event._count.replies,
    })),
  };
}

function listNames(items: { emoji: string; title: string }[]) {
  const names = items.map((item) => `${item.emoji} ${item.title}`);
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

// Runs hourly. Each reminder slot is sent at most once per person, circle, and
// Phoenix day, and only while something is still waiting.
export async function sendStreakReminders(now = new Date()) {
  const prisma = getPrisma();
  const today = phoenixDateKey(now);
  const hour = phoenixHour(now);
  const rows = await prisma.streak.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      userId: true,
      circleId: true,
      kind: true,
      title: true,
      emoji: true,
      startedAt: true,
      retiredAt: true,
      // Today's and yesterday's states only depend on their own entries.
      entries: {
        where: { day: { gte: requireDateKey(shiftDateKey(today, -1)) } },
        select: entrySelect,
      },
    },
  });
  if (!rows.length) return { sent: 0 };
  const userIds = [...new Set(rows.map((row) => row.userId))];
  const [memberships, prefsFor] = await Promise.all([
    prisma.membership.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, circleId: true },
    }),
    getNotificationPrefsByUser(userIds, prisma),
  ]);
  const members = new Set(
    memberships.map((item) => `${item.userId}:${item.circleId}`),
  );
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.userId}:${row.circleId}`;
    if (!members.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  let sent = 0;
  for (const group of groups.values()) {
    const { userId, circleId } = group[0];
    const prefs = prefsFor(userId);
    const states = group.map((row) => ({
      row,
      summary: summarizeStreak(row, row.entries, now),
    }));
    const breaking = states
      .filter((item) => item.summary.yesterdayState === "pending")
      .map((item) => item.row);
    const messages: { slot: string; title: string; body: string }[] = [];
    // The evening message also covers quit streaks, so the morning one stops
    // once evening arrives, unless someone set "morning" later than evening.
    if (
      prefs.streakReminders &&
      hour >= prefs.streakMorningHour &&
      (hour < prefs.streakEveningHour ||
        prefs.streakMorningHour >= prefs.streakEveningHour)
    ) {
      const confirm = breaking.filter((row) => row.kind === "QUIT");
      if (confirm.length)
        messages.push({
          slot: "morning",
          title: "Was yesterday clean?",
          body: `${listNames(confirm)}. Confirm before midnight to keep ${confirm.length === 1 ? "it" : "them"} going.`,
        });
    }
    if (hour >= prefs.streakEveningHour) {
      const warn = prefs.streakWarnings ? breaking : [];
      const waiting = prefs.streakReminders
        ? states
            .filter(
              (item) =>
                item.row.kind === "BUILD" &&
                item.summary.todayState === "pending" &&
                !warn.includes(item.row),
            )
            .map((item) => item.row)
        : [];
      if (warn.length)
        messages.push({
          slot: "evening",
          title:
            warn.length === 1
              ? `${warn[0].emoji} ${warn[0].title} breaks at midnight`
              : `${warn.length} streaks break at midnight`,
          body: `Log yesterday for ${listNames(warn)} to keep ${warn.length === 1 ? "it" : "them"} alive.${waiting.length ? ` Still waiting today: ${listNames(waiting)}.` : ""}`,
        });
      else if (waiting.length)
        messages.push({
          slot: "evening",
          title:
            waiting.length === 1
              ? `${waiting[0].emoji} ${waiting[0].title} is waiting`
              : `${waiting.length} streaks are waiting`,
          body: `Did you do ${waiting.length === 1 ? "it" : "them"} today? Logging takes one tap.`,
        });
    }
    for (const message of messages) {
      const dedupeKey = `streak-reminder:${message.slot}:${userId}:${circleId}:${today}`;
      // Repeat runs this hour or later today must not push again.
      if (
        await prisma.notification.findUnique({
          where: { dedupeKey },
          select: { id: true },
        })
      )
        continue;
      await createNotificationAndPush({
        recipientId: userId,
        actorId: userId,
        allowSelf: true,
        circleId,
        kind: "STREAK_REMINDER",
        title: message.title,
        body: message.body,
        data: { url: `/streaks?${new URLSearchParams({ circle: circleId })}` },
        dedupeKey,
        prefs,
      });
      sent += 1;
    }
  }
  return { sent };
}

export async function getWrappedStreaks(
  circleId: string,
  week: { startKey: string; endKey: string; startAt: Date; endAt: Date },
  now = new Date(),
) {
  const rows = await getPrisma().streak.findMany({
    where: {
      circleId,
      visibility: "CIRCLE",
      startedAt: { lt: week.endAt },
      OR: [{ retiredAt: null }, { retiredAt: { gte: week.startAt } }],
      user: { memberships: { some: { circleId } } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      user: { select: socialAuthorSelect },
      entries: { select: entrySelect },
      events: {
        where: {
          kind: "MILESTONE",
          createdAt: { gte: week.startAt, lt: week.endAt },
        },
        select: { count: true },
      },
    },
  });
  return rows
    .map((row) => {
      const inWeek = summarizeStreak(row, row.entries, now).days.filter(
        (day) => day.day >= week.startKey && day.day <= week.endKey,
      );
      const done = inWeek.filter((day) => day.state === "done");
      return {
        id: row.id,
        title: row.title,
        emoji: row.emoji,
        kind: row.kind,
        unitLabel: row.unitLabel,
        user: row.user,
        possible: inWeek.length,
        done: done.length,
        slips: inWeek.reduce((count, day) => count + day.slips, 0),
        costCents: done.reduce((sum, day) => sum + day.costCents, 0),
        units: done.reduce((sum, day) => sum + day.units, 0),
        milestones: row.events.map((event) => event.count),
      };
    })
    .filter((item) => item.possible > 0)
    .sort(
      (a, b) =>
        b.milestones.length - a.milestones.length ||
        b.done / b.possible - a.done / a.possible ||
        a.user.name.localeCompare(b.user.name),
    );
}
