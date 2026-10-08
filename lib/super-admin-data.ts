import "server-only";

import { getPrisma } from "@/lib/prisma";
import { phoenixDateKey } from "@/lib/time";

export const ADMIN_PAGE_SIZE = 50;
const DAY_MS = 86_400_000;
const SERIES_DAYS = 30;

const personSelect = {
  id: true,
  name: true,
  image: true,
  initials: true,
} as const;

export function adminPage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function adminQuery(value: string | undefined) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

export function latestDate(...dates: (Date | null | undefined)[]) {
  let latest: Date | null = null;
  for (const date of dates)
    if (date && (!latest || date > latest)) latest = date;
  return latest;
}

function activeUserCount(since: Date) {
  return getPrisma().user.count({
    where: {
      OR: [
        { activities: { some: { createdAt: { gte: since } } } },
        { sessions: { some: { updatedAt: { gte: since } } } },
      ],
    },
  });
}

async function dailySeries(since: Date) {
  const rows = await getPrisma().$queryRaw<
    Array<{ day: string; kind: "signups" | "activity"; count: number }>
  >`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Phoenix', 'YYYY-MM-DD') AS day,
      'signups' AS kind, count(*)::int AS count
    FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1
    UNION ALL
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Phoenix', 'YYYY-MM-DD') AS day,
      'activity' AS kind, count(*)::int AS count
    FROM "ActivityEvent" WHERE "createdAt" >= ${since} GROUP BY 1
  `;
  const now = Date.now();
  // Phoenix has no DST, so fixed 24-hour steps always land on distinct days.
  const days = Array.from({ length: SERIES_DAYS }, (_, index) =>
    phoenixDateKey(new Date(now - (SERIES_DAYS - 1 - index) * DAY_MS)),
  );
  const lookup = new Map(rows.map((row) => [`${row.kind}:${row.day}`, row]));
  return days.map((day) => ({
    day,
    signups: lookup.get(`signups:${day}`)?.count ?? 0,
    activity: lookup.get(`activity:${day}`)?.count ?? 0,
  }));
}

export async function getAdminOverview() {
  const prisma = getPrisma();
  const now = Date.now();
  const dayAgo = new Date(now - DAY_MS);
  const weekAgo = new Date(now - 7 * DAY_MS);
  const monthAgo = new Date(now - 30 * DAY_MS);
  const seriesStart = new Date(now - SERIES_DAYS * DAY_MS);

  const [
    users,
    usersThisWeek,
    usersThisMonth,
    circleless,
    dau,
    wau,
    mau,
    circles,
    circlesThisWeek,
    memberships,
    taskStatuses,
    tasksThisWeek,
    proofs,
    proofsAwaitingReview,
    checkIns,
    replies,
    likes,
    bucketStatuses,
    screenTime,
    pushSubscriptions,
    liveSessions,
    aiRuns,
    mediaFailures,
    stuckProofs,
    mediaStorage,
    series,
    recentUsers,
    recentActivity,
    busyCircleCounts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.user.count({ where: { memberships: { none: {} } } }),
    activeUserCount(dayAgo),
    activeUserCount(weekAgo),
    activeUserCount(monthAgo),
    prisma.circle.count(),
    prisma.circle.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.membership.count(),
    prisma.commitment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.commitment.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.taskProof.count({ where: { replacedById: null } }),
    prisma.taskProof.count({
      where: { replacedById: null, reviewStatus: "PENDING" },
    }),
    prisma.checkInUpdate.count(),
    prisma.socialReply.count(),
    prisma.postLike.count(),
    prisma.bucketItem.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.screenTimeSubmission.count(),
    prisma.pushSubscription.count(),
    prisma.session.count({ where: { expiresAt: { gt: new Date(now) } } }),
    prisma.aIRun.groupBy({
      by: ["feature", "status"],
      where: { createdAt: { gte: monthAgo } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
      _avg: { durationMs: true },
    }),
    prisma.mediaUpload.count({
      where: { processingError: { not: null }, createdAt: { gte: weekAgo } },
    }),
    prisma.pendingProof.count({
      where: { error: { not: null }, dismissed: false, proofId: null },
    }),
    prisma.mediaUpload.aggregate({
      where: { ready: true },
      _sum: { sizeBytes: true },
      _count: { _all: true },
    }),
    dailySeries(seriesStart),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        ...personSelect,
        discordUsername: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
    }),
    prisma.activityEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        kind: true,
        summary: true,
        createdAt: true,
        actor: { select: personSelect },
        circle: { select: { id: true, name: true } },
      },
    }),
    prisma.activityEvent.groupBy({
      by: ["circleId"],
      where: { createdAt: { gte: weekAgo } },
      _count: { circleId: true },
      orderBy: { _count: { circleId: "desc" } },
      take: 6,
    }),
  ]);

  const busyCircleNames = await prisma.circle.findMany({
    where: { id: { in: busyCircleCounts.map((row) => row.circleId) } },
    select: { id: true, name: true, _count: { select: { memberships: true } } },
  });
  const circleById = new Map(busyCircleNames.map((c) => [c.id, c]));
  const busyCircles = busyCircleCounts.flatMap((row) => {
    const circle = circleById.get(row.circleId);
    return circle
      ? [
          {
            id: circle.id,
            name: circle.name,
            members: circle._count.memberships,
            events: row._count.circleId,
          },
        ]
      : [];
  });

  const taskCounts = Object.fromEntries(
    taskStatuses.map((row) => [row.status, row._count._all]),
  ) as Partial<Record<(typeof taskStatuses)[number]["status"], number>>;
  const bucketCounts = Object.fromEntries(
    bucketStatuses.map((row) => [row.status, row._count._all]),
  ) as Partial<Record<(typeof bucketStatuses)[number]["status"], number>>;

  return {
    users: {
      total: users,
      thisWeek: usersThisWeek,
      thisMonth: usersThisMonth,
      circleless,
      dau,
      wau,
      mau,
    },
    circles: {
      total: circles,
      thisWeek: circlesThisWeek,
      memberships,
      averageSize: circles ? memberships / circles : 0,
    },
    tasks: {
      total: taskStatuses.reduce((sum, row) => sum + row._count._all, 0),
      thisWeek: tasksThisWeek,
      byStatus: taskCounts,
    },
    content: {
      proofs,
      proofsAwaitingReview,
      checkIns,
      replies,
      likes,
      screenTime,
      bucketItems: bucketStatuses.reduce(
        (sum, row) => sum + row._count._all,
        0,
      ),
      bucketCompleted: bucketCounts.COMPLETED ?? 0,
    },
    system: {
      pushSubscriptions,
      liveSessions,
      mediaFailures,
      stuckProofs,
      mediaFiles: mediaStorage._count._all,
      mediaBytes: Number(mediaStorage._sum.sizeBytes ?? 0),
    },
    aiRuns: aiRuns
      .map((row) => ({
        feature: row.feature,
        status: row.status,
        count: row._count._all,
        inputTokens: row._sum.inputTokens ?? 0,
        outputTokens: row._sum.outputTokens ?? 0,
        averageMs: Math.round(row._avg.durationMs ?? 0),
      }))
      .sort(
        (a, b) =>
          a.feature.localeCompare(b.feature) ||
          a.status.localeCompare(b.status),
      ),
    series,
    recentUsers,
    recentActivity,
    busyCircles,
  };
}

export async function listAdminUsers(query: string, page: number) {
  const prisma = getPrisma();
  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { email: { contains: query, mode: "insensitive" as const } },
          {
            discordUsername: { contains: query, mode: "insensitive" as const },
          },
          { discordId: query },
          { id: query },
        ],
      }
    : {};
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        ...personSelect,
        email: true,
        discordUsername: true,
        createdAt: true,
        sessions: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true },
        },
        activities: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
        _count: {
          select: {
            memberships: true,
            commitments: true,
            proofs: true,
            checkInUpdates: true,
            socialReplies: true,
          },
        },
      },
    }),
  ]);
  return { total, users };
}

export async function getAdminUser(userId: string) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...personSelect,
      email: true,
      emailVerified: true,
      discordId: true,
      discordUsername: true,
      primaryColor: true,
      createdAt: true,
      updatedAt: true,
      accounts: {
        select: { providerId: true, accountId: true, createdAt: true },
      },
      memberships: {
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          createdAt: true,
          circle: {
            select: {
              id: true,
              name: true,
              slug: true,
              _count: { select: { memberships: true } },
            },
          },
        },
      },
      sessions: {
        where: { expiresAt: { gt: new Date() } },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          userAgent: true,
        },
      },
      _count: {
        select: {
          commitments: true,
          proofs: true,
          proofReviews: true,
          checkInUpdates: true,
          socialReplies: true,
          postLikes: true,
          bucketItems: true,
          screenTimeSubmissions: true,
          pushSubscriptions: true,
          invitesCreated: true,
          aiRuns: true,
        },
      },
    },
  });
  if (!user) return null;
  const [taskStatuses, aiUsage, activity, lastSession] = await Promise.all([
    prisma.commitment.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.aIRun.aggregate({
      where: { userId },
      _sum: { inputTokens: true, outputTokens: true },
      _max: { createdAt: true },
    }),
    prisma.activityEvent.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        kind: true,
        summary: true,
        createdAt: true,
        circle: { select: { id: true, name: true } },
      },
    }),
    prisma.session.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);
  return {
    user,
    lastSeen: latestDate(lastSession?.updatedAt, activity[0]?.createdAt),
    taskStatuses: Object.fromEntries(
      taskStatuses.map((row) => [row.status, row._count._all]),
    ) as Record<string, number>,
    aiUsage: {
      inputTokens: aiUsage._sum.inputTokens ?? 0,
      outputTokens: aiUsage._sum.outputTokens ?? 0,
      lastRun: aiUsage._max.createdAt,
    },
    activity,
  };
}

export async function listAdminCircles(query: string, page: number) {
  const prisma = getPrisma();
  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { slug: { contains: query, mode: "insensitive" as const } },
          { id: query },
        ],
      }
    : {};
  const [total, circles] = await Promise.all([
    prisma.circle.count({ where }),
    prisma.circle.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        memberships: {
          where: { role: "OWNER" },
          orderBy: { createdAt: "asc" },
          select: { user: { select: { id: true, name: true } } },
        },
        activities: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
        _count: {
          select: {
            memberships: true,
            commitments: true,
            proofs: true,
            checkInUpdates: true,
            bucketItems: true,
          },
        },
      },
    }),
  ]);
  return { total, circles };
}

export async function getAdminCircle(circleId: string) {
  const prisma = getPrisma();
  const circle = await prisma.circle.findUnique({
    where: { id: circleId },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      memberships: {
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          createdAt: true,
          user: { select: { ...personSelect, discordUsername: true } },
        },
      },
      invites: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          label: true,
          role: true,
          createdAt: true,
          expiresAt: true,
          usedAt: true,
          revokedAt: true,
          createdBy: { select: { id: true, name: true } },
          usedBy: { select: { id: true, name: true } },
        },
      },
      bucketItems: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          proposer: { select: { id: true, name: true } },
        },
      },
      _count: {
        select: {
          memberships: true,
          commitments: true,
          proofs: true,
          checkInUpdates: true,
          socialReplies: true,
          postLikes: true,
          bucketItems: true,
          screenTimeSubmissions: true,
          invites: true,
          aiRuns: true,
        },
      },
    },
  });
  if (!circle) return null;
  const [taskStatuses, tasksByUser, proofsByUser, checkInsByUser, lastSeen] =
    await Promise.all([
      prisma.commitment.groupBy({
        by: ["status"],
        where: { circleId },
        _count: { _all: true },
      }),
      prisma.commitment.groupBy({
        by: ["userId"],
        where: { circleId },
        _count: { _all: true },
      }),
      prisma.taskProof.groupBy({
        by: ["ownerId"],
        where: { circleId, replacedById: null },
        _count: { _all: true },
      }),
      prisma.checkInUpdate.groupBy({
        by: ["userId"],
        where: { circleId },
        _count: { _all: true },
      }),
      prisma.activityEvent.groupBy({
        by: ["actorId"],
        where: { circleId },
        _max: { createdAt: true },
      }),
    ]);
  const activity = await prisma.activityEvent.findMany({
    where: { circleId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      kind: true,
      summary: true,
      createdAt: true,
      actor: { select: personSelect },
    },
  });
  const tasks = new Map(tasksByUser.map((r) => [r.userId, r._count._all]));
  const proofs = new Map(proofsByUser.map((r) => [r.ownerId, r._count._all]));
  const checkIns = new Map(
    checkInsByUser.map((r) => [r.userId, r._count._all]),
  );
  const seen = new Map(lastSeen.map((r) => [r.actorId, r._max.createdAt]));
  return {
    circle,
    members: circle.memberships.map((membership) => ({
      ...membership,
      tasks: tasks.get(membership.user.id) ?? 0,
      proofs: proofs.get(membership.user.id) ?? 0,
      checkIns: checkIns.get(membership.user.id) ?? 0,
      lastActive: seen.get(membership.user.id) ?? null,
    })),
    taskStatuses: Object.fromEntries(
      taskStatuses.map((row) => [row.status, row._count._all]),
    ) as Record<string, number>,
    activity,
  };
}
