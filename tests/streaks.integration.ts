import { afterAll, beforeAll, expect, mock, test } from "bun:test";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error(
    "Use bun run test:integration. Disposable Postgres is required.",
  );
mock.module("server-only", () => ({}));
const { getPrisma } = await import("@/lib/prisma");
const {
  addStreakEntry,
  changeStreak,
  createStreak,
  deleteStreak,
  getMemberStreaks,
  getStreakBoard,
  getStreakDetail,
  getStreaksNeedingLog,
  nudgeStreak,
  removeStreakEntry,
  sendStreakReminders,
} = await import("@/lib/streaks");
const { getFeedPage } = await import("@/lib/social-data");
const { setPostLike } = await import("@/lib/post-likes");
const { createSocialReply } = await import("@/lib/social-replies");
const { phoenixWallToDate } = await import("@/lib/time");
const { shiftDateKey } = await import("@/lib/timeblocks");

const prisma = getPrisma();
const circleId = "streak-circle";
const otherCircleId = "streak-other";
const ownerId = "streak-owner";
const friendId = "streak-friend";
const outsiderId = "streak-outsider";
const reminderId = "streak-reminded";
// Monday, October 5, 2026 in Phoenix.
const monday = "2026-10-05";
const at = (day: string, hour = 9, minute = 0) =>
  phoenixWallToDate(day, hour, minute, 0, 0) as Date;
const quitInput = (title: string, extra: Record<string, unknown> = {}) => ({
  circleId,
  title,
  kind: "QUIT",
  visibility: "CIRCLE",
  ...extra,
});

beforeAll(async () => {
  await prisma.user.createMany({
    data: [ownerId, friendId, outsiderId, reminderId].map((id) => ({
      id,
      name: id,
      email: `${id}@example.invalid`,
    })),
  });
  await prisma.circle.createMany({
    data: [circleId, otherCircleId].map((id) => ({ id, name: id, slug: id })),
  });
  await prisma.membership.createMany({
    data: [
      { userId: ownerId, circleId, role: "OWNER" },
      { userId: friendId, circleId },
      { userId: reminderId, circleId },
      { userId: outsiderId, circleId: otherCircleId },
    ],
  });
});
afterAll(async () => {
  await prisma.$disconnect();
});

test("quit streaks count automatically, log slips, and post milestones", async () => {
  const streak = await createStreak(
    ownerId,
    circleId,
    quitInput("No caffeine", {
      dailyCostCents: 500,
      dailyUnits: 300,
      unitLabel: "cups",
    }),
    at(monday, 10),
  );
  const first = await getStreakDetail(
    circleId,
    streak.id,
    ownerId,
    at("2026-10-06", 8),
  );
  expect(first?.streak.summary.current).toBe(1);
  expect(first?.streak.summary.run).toEqual({ costCents: 500, units: 300 });
  expect(
    await prisma.streakEntry.count({ where: { streakId: streak.id } }),
  ).toBe(0);
  await expect(
    addStreakEntry(
      streak.id,
      ownerId,
      circleId,
      { action: "clean", day: monday },
      at("2026-10-06", 8),
    ),
  ).rejects.toThrow();
  await expect(
    addStreakEntry(
      streak.id,
      friendId,
      circleId,
      { action: "slip" },
      at("2026-10-06", 9),
    ),
  ).rejects.toThrow("Only the person");
  await sendStreakReminders(at("2026-10-12", 8));
  await sendStreakReminders(at("2026-10-12", 9));
  expect(
    await prisma.streakEvent.count({
      where: { streakId: streak.id, kind: "MILESTONE" },
    }),
  ).toBe(1);
  const milestone = await prisma.streakEvent.findFirstOrThrow({
    where: { streakId: streak.id, kind: "MILESTONE" },
  });
  expect(milestone).toMatchObject({ count: 7, costCents: 3500, units: 2100 });

  const feed = await getFeedPage({ viewerId: friendId, circleId });
  const post = feed.items.find(
    (item) => item.kind === "streak" && item.id === milestone.id,
  );
  expect(post).toMatchObject({
    event: "MILESTONE",
    count: 7,
    streakTitle: "No caffeine",
    likeCount: 0,
  });
  const pageOne = await getFeedPage({ viewerId: friendId, circleId, limit: 1 });
  expect(pageOne.nextCursor).not.toBeNull();
  await getFeedPage({
    viewerId: friendId,
    circleId,
    limit: 1,
    cursor: pageOne.nextCursor ?? undefined,
  });
  expect(
    await setPostLike(friendId, circleId, {
      targetType: "STREAK_EVENT",
      targetId: milestone.id,
      liked: true,
    }),
  ).toEqual({ likeCount: 1, likedByMe: true });
  await createSocialReply(friendId, circleId, {
    targetType: "STREAK_EVENT",
    targetId: milestone.id,
    body: "Proud of you",
  });
  const reply = await prisma.notification.findFirstOrThrow({
    where: {
      recipientId: ownerId,
      kind: "REPLY_POSTED",
      entityId: milestone.id,
    },
  });
  expect((reply.data as { url: string }).url).toContain(
    `/posts/streak/${milestone.id}`,
  );

  const slipNow = at("2026-10-12", 19);
  await addStreakEntry(
    streak.id,
    ownerId,
    circleId,
    { action: "slip", occurredAt: "2026-10-12T15:00", note: "Long day" },
    slipNow,
  );
  const slipped = await addStreakEntry(
    streak.id,
    ownerId,
    circleId,
    { action: "slip", occurredAt: "2026-10-12T18:30" },
    slipNow,
  );
  expect(slipped.summary.current).toBe(0);
  expect(slipped.summary.slips).toBe(2);
  expect(slipped.summary.longest).toBe(7);
  expect(slipped.summary.runStartedAt).toBe(
    at("2026-10-12", 18, 30).toISOString(),
  );
  await expect(
    addStreakEntry(
      streak.id,
      ownerId,
      circleId,
      { action: "slip", occurredAt: "2026-10-10T12:00" },
      slipNow,
    ),
  ).rejects.toThrow("yesterday or today");
  await expect(
    addStreakEntry(
      streak.id,
      ownerId,
      circleId,
      { action: "slip", occurredAt: "2026-10-12T21:00" },
      slipNow,
    ),
  ).rejects.toThrow("hasn’t happened");

  // A backdated slip overrides yesterday's automatic clean result.
  await addStreakEntry(
    streak.id,
    ownerId,
    circleId,
    { action: "slip", occurredAt: "2026-10-11T22:00" },
    slipNow,
  );
  expect(
    await prisma.streakEntry.count({
      where: {
        streakId: streak.id,
        kind: "CLEAN",
        day: new Date("2026-10-11"),
      },
    }),
  ).toBe(0);
});

test("build streaks add up logs, keep yesterday open, and stay private", async () => {
  await expect(
    createStreak(
      ownerId,
      circleId,
      quitInput("Read", { kind: "BUILD", dailyCostCents: 100 }),
      at(monday, 7),
    ),
  ).rejects.toThrow("only tracked for quit");
  const streak = await createStreak(
    ownerId,
    circleId,
    {
      circleId,
      title: "Read",
      kind: "BUILD",
      visibility: "PRIVATE",
      dailyUnits: 1000,
      unitLabel: "pages",
    },
    at(monday, 7),
  );
  expect(
    await prisma.streakEvent.count({ where: { streakId: streak.id } }),
  ).toBe(0);
  expect(
    await prisma.activityEvent.count({ where: { entityId: streak.id } }),
  ).toBe(0);
  await addStreakEntry(
    streak.id,
    ownerId,
    circleId,
    { action: "log", day: monday },
    at(monday, 9),
  );
  const more = await addStreakEntry(
    streak.id,
    ownerId,
    circleId,
    { action: "log", day: monday, units: 1500, note: "Couldn’t stop" },
    at(monday, 21),
  );
  expect(more.summary.current).toBe(1);
  expect(more.summary.run.units).toBe(2500);
  await addStreakEntry(
    streak.id,
    ownerId,
    circleId,
    { action: "log", day: monday },
    at("2026-10-06", 9),
  );
  await expect(
    addStreakEntry(
      streak.id,
      ownerId,
      circleId,
      { action: "log", day: monday },
      at("2026-10-07", 9),
    ),
  ).rejects.toThrow("today or yesterday");
  await expect(
    addStreakEntry(
      streak.id,
      ownerId,
      circleId,
      { action: "slip" },
      at("2026-10-07", 9),
    ),
  ).rejects.toThrow("can’t slip");

  let result = more;
  for (let offset = 1; offset < 7; offset++) {
    const day = shiftDateKey(monday, offset);
    result = await addStreakEntry(
      streak.id,
      ownerId,
      circleId,
      { action: "log", day },
      at(day, 20),
    );
  }
  // The owner still celebrates privately, but nothing reaches the circle.
  expect(result.milestone).toBe(7);
  expect(
    await prisma.streakEvent.count({ where: { streakId: streak.id } }),
  ).toBe(0);
  const now = at("2026-10-11", 21);
  expect(await getStreakDetail(circleId, streak.id, friendId, now)).toBeNull();
  expect(
    (await getStreakDetail(circleId, streak.id, ownerId, now))?.streak.summary
      .current,
  ).toBe(7);
  expect(
    (await getStreakBoard(circleId, friendId, now)).circle
      .flatMap((group) => group.streaks)
      .some((view) => view.id === streak.id),
  ).toBe(false);
  expect(
    (await getStreakBoard(circleId, ownerId, now)).mine.some(
      (view) => view.id === streak.id,
    ),
  ).toBe(true);
  expect(
    (await getMemberStreaks(circleId, ownerId, friendId, now)).active.some(
      (view) => view.id === streak.id,
    ),
  ).toBe(false);
  await expect(nudgeStreak(streak.id, friendId, circleId, now)).rejects.toThrow(
    "not found",
  );
  await expect(
    setPostLike(friendId, circleId, {
      targetType: "STREAK_EVENT",
      targetId: streak.id,
      liked: true,
    }),
  ).rejects.toThrow("not found");
});

test("nudges need an unlogged today and go out once per friend per day", async () => {
  const streak = await createStreak(
    ownerId,
    circleId,
    {
      circleId,
      title: "Gym",
      kind: "BUILD",
      visibility: "CIRCLE",
    },
    at(monday, 7),
  );
  await nudgeStreak(streak.id, friendId, circleId, at("2026-10-06", 12));
  await nudgeStreak(streak.id, friendId, circleId, at("2026-10-06", 13));
  expect(
    await prisma.notification.count({
      where: {
        recipientId: ownerId,
        kind: "STREAK_NUDGE",
        entityId: streak.id,
      },
    }),
  ).toBe(1);
  expect(
    (await getStreakBoard(circleId, friendId, at("2026-10-06", 14))).circle
      .flatMap((group) => group.streaks)
      .find((view) => view.id === streak.id)?.nudged,
  ).toBe(true);
  await expect(
    nudgeStreak(streak.id, ownerId, circleId, at("2026-10-06", 13)),
  ).rejects.toThrow("yourself");
  await expect(
    nudgeStreak(streak.id, outsiderId, circleId, at("2026-10-06", 13)),
  ).rejects.toThrow("no longer in this circle");
  expect(
    (await getStreaksNeedingLog(circleId, ownerId, at("2026-10-06", 14))).some(
      (view) => view.id === streak.id,
    ),
  ).toBe(true);
  await addStreakEntry(
    streak.id,
    ownerId,
    circleId,
    { action: "log", day: "2026-10-06" },
    at("2026-10-06", 14),
  );
  await expect(
    nudgeStreak(streak.id, friendId, circleId, at("2026-10-06", 15)),
  ).rejects.toThrow("caught up");
});

test("reminders go out once per slot and follow preferences", async () => {
  await createStreak(
    reminderId,
    circleId,
    quitInput("No vaping"),
    at(monday, 10),
  );
  await createStreak(
    reminderId,
    circleId,
    {
      circleId,
      title: "Stretch",
      kind: "BUILD",
      visibility: "PRIVATE",
    },
    at(monday, 10),
  );
  const reminders = () =>
    prisma.notification.findMany({
      where: { recipientId: reminderId, kind: "STREAK_REMINDER" },
      orderBy: { createdAt: "asc" },
    });
  await sendStreakReminders(at("2026-10-06", 8));
  expect(await reminders()).toHaveLength(0);
  await sendStreakReminders(at("2026-10-06", 9, 2));
  await sendStreakReminders(at("2026-10-06", 10, 2));
  const morning = await reminders();
  expect(morning).toHaveLength(1);
  expect(morning[0].title).toBe("Your streaks today");
  expect(morning[0].body).not.toContain("No vaping");
  expect(morning[0].body).toContain("Stretch");
  await sendStreakReminders(at("2026-10-06", 23, 2));
  const evening = await reminders();
  expect(evening).toHaveLength(2);
  expect(evening[1].title).toBe("“Stretch” breaks at midnight");
  await prisma.notificationPreference.create({
    data: { userId: reminderId, streakReminders: false, streakWarnings: false },
  });
  await sendStreakReminders(at("2026-10-07", 10, 2));
  await sendStreakReminders(at("2026-10-07", 23, 2));
  expect(await reminders()).toHaveLength(2);
});

test("retiring freezes a streak into a trophy and deleting removes its posts", async () => {
  const streak = await createStreak(
    ownerId,
    circleId,
    quitInput("No soda", { dailyCostCents: 250 }),
    at(monday, 6),
  );
  await changeStreak(
    streak.id,
    ownerId,
    circleId,
    { action: "retire" },
    at("2026-10-07", 9),
  );
  const retired = await prisma.streakEvent.findFirstOrThrow({
    where: { streakId: streak.id, kind: "RETIRED" },
  });
  expect(retired).toMatchObject({ count: 2, costCents: 500 });
  await expect(
    addStreakEntry(
      streak.id,
      ownerId,
      circleId,
      { action: "slip" },
      at("2026-10-08", 8),
    ),
  ).rejects.toThrow("retired");
  await expect(
    changeStreak(streak.id, ownerId, circleId, {
      action: "details",
      title: "Renamed",
    }),
  ).rejects.toThrow("can’t be changed");
  const trophies = await getMemberStreaks(
    circleId,
    ownerId,
    friendId,
    at("2026-11-01"),
  );
  expect(
    trophies.retired.find((view) => view.id === streak.id)?.summary.current,
  ).toBe(2);
  await setPostLike(friendId, circleId, {
    targetType: "STREAK_EVENT",
    targetId: retired.id,
    liked: true,
  });
  await createSocialReply(friendId, circleId, {
    targetType: "STREAK_EVENT",
    targetId: retired.id,
    body: "Legend",
  });
  await expect(deleteStreak(streak.id, friendId, circleId)).rejects.toThrow(
    "Only the person",
  );
  await deleteStreak(streak.id, ownerId, circleId);
  expect(
    await prisma.streakEvent.count({ where: { streakId: streak.id } }),
  ).toBe(0);
  expect(
    await prisma.postLike.count({ where: { streakEventId: retired.id } }),
  ).toBe(0);
  expect(
    await prisma.socialReply.count({ where: { streakEventId: retired.id } }),
  ).toBe(0);
});

test("undo is limited to open days and milestones post once per run", async () => {
  const streak = await createStreak(
    ownerId,
    circleId,
    {
      circleId,
      title: "Walk",
      kind: "BUILD",
      visibility: "CIRCLE",
    },
    at(monday, 7),
  );
  for (let offset = 0; offset < 6; offset++) {
    const day = shiftDateKey(monday, offset);
    await addStreakEntry(
      streak.id,
      ownerId,
      circleId,
      { action: "log", day },
      at(day, 20),
    );
  }
  const seventh = "2026-10-11";
  const hit = await addStreakEntry(
    streak.id,
    ownerId,
    circleId,
    { action: "log", day: seventh },
    at(seventh, 20),
  );
  expect(hit.milestone).toBe(7);
  if (!hit.entry) throw new Error("Expected an entry");
  await removeStreakEntry(
    streak.id,
    hit.entry.id,
    ownerId,
    circleId,
    at(seventh, 21),
  );
  const again = await addStreakEntry(
    streak.id,
    ownerId,
    circleId,
    { action: "log", day: seventh },
    at(seventh, 22),
  );
  expect(again.milestone).toBe(7);
  expect(
    await prisma.streakEvent.count({
      where: { streakId: streak.id, kind: "MILESTONE" },
    }),
  ).toBe(1);
  const oldest = await prisma.streakEntry.findFirstOrThrow({
    where: { streakId: streak.id, day: new Date(monday) },
  });
  await expect(
    removeStreakEntry(streak.id, oldest.id, ownerId, circleId, at(seventh, 22)),
  ).rejects.toThrow("locked in");
});

test("scheduled days reject off-day entries and count automatic milestones across weekends", async () => {
  const streak = await createStreak(
    ownerId,
    circleId,
    quitInput("School days", {
      weekdays: [1, 2, 3, 4, 5],
      dailyCostCents: 100,
    }),
    at(monday),
  );
  await expect(
    addStreakEntry(
      streak.id,
      ownerId,
      circleId,
      { action: "slip", occurredAt: "2026-10-10T12:00" },
      at("2026-10-11"),
    ),
  ).rejects.toThrow("off day");
  await expect(
    addStreakEntry(
      streak.id,
      ownerId,
      circleId,
      { action: "slip" },
      at("2026-10-11"),
    ),
  ).rejects.toThrow("off day");
  await expect(
    nudgeStreak(streak.id, friendId, circleId, at("2026-10-11")),
  ).rejects.toThrow("caught up");
  expect(
    (await getStreaksNeedingLog(circleId, ownerId, at("2026-10-11"))).some(
      (view) => view.id === streak.id,
    ),
  ).toBe(false);
  await sendStreakReminders(at("2026-10-14"));
  const detail = await getStreakDetail(
    circleId,
    streak.id,
    ownerId,
    at("2026-10-14"),
  );
  expect(detail?.streak.summary.current).toBe(7);
  expect(detail?.streak.summary.allTime.costCents).toBe(700);
  expect(detail?.history.filter((day) => day.state === "off")).toHaveLength(2);
  expect(
    await prisma.streakEvent.count({
      where: { streakId: streak.id, kind: "MILESTONE", count: 7 },
    }),
  ).toBe(1);
});

test("schedule edits apply tomorrow without rewriting existing results or omissions", async () => {
  const streak = await createStreak(
    ownerId,
    circleId,
    quitInput("Changing schedule", { kind: "BUILD" }),
    at("2026-10-09"),
  );
  await addStreakEntry(
    streak.id,
    ownerId,
    circleId,
    { action: "log", day: "2026-10-09" },
    at("2026-10-09", 20),
  );
  const details = {
    action: "details",
    title: streak.title,
    weekdays: [1, 2, 3, 4, 5],
  };
  await changeStreak(streak.id, ownerId, circleId, details, at("2026-10-11"));
  let view = (
    await getStreakDetail(circleId, streak.id, ownerId, at("2026-10-11"))
  )?.streak;
  expect(view?.scheduleStartsOn).toBe("2026-10-12");
  expect(view?.summary.yesterdayState).toBe("missed");
  await changeStreak(
    streak.id,
    ownerId,
    circleId,
    { ...details, weekdays: [0, 1, 2, 3, 4, 5, 6] },
    at("2026-10-11", 12),
  );
  await changeStreak(
    streak.id,
    ownerId,
    circleId,
    details,
    at("2026-10-11", 13),
  );
  expect(
    await prisma.streakSchedule.count({ where: { streakId: streak.id } }),
  ).toBe(2);
  view = (await getStreakDetail(circleId, streak.id, ownerId, at("2026-10-18")))
    ?.streak;
  expect(view?.summary.todayState).toBe("off");
  expect(view?.summary.current).toBe(0);
  expect(view?.summary.longest).toBe(1);
  expect(view?.summary.totalDays).toBe(1);
});

test("breaks preserve results, resume automatically, and can end early", async () => {
  const streak = await createStreak(
    ownerId,
    circleId,
    quitInput("Breakable", { kind: "BUILD" }),
    at(monday),
  );
  await addStreakEntry(
    streak.id,
    ownerId,
    circleId,
    { action: "log", day: monday },
    at(monday, 10),
  );
  await changeStreak(
    streak.id,
    ownerId,
    circleId,
    { action: "pause", length: "week" },
    at(monday, 11),
  );
  let detail = await getStreakDetail(
    circleId,
    streak.id,
    ownerId,
    at(monday, 12),
  );
  expect(detail?.streak.break).toEqual({
    startDay: "2026-10-06",
    resumeDay: "2026-10-12",
  });
  expect(detail?.streak.summary.todayState).toBe("done");
  await expect(
    addStreakEntry(
      streak.id,
      ownerId,
      circleId,
      { action: "log", day: "2026-10-06" },
      at("2026-10-06"),
    ),
  ).rejects.toThrow("off day");
  detail = await getStreakDetail(
    circleId,
    streak.id,
    ownerId,
    at("2026-10-12"),
  );
  expect(detail?.streak.break).toBeNull();
  expect(detail?.streak.summary.current).toBe(1);
  expect(detail?.streak.summary.todayState).toBe("pending");
  await changeStreak(
    streak.id,
    ownerId,
    circleId,
    { action: "resume" },
    at("2026-10-08"),
  );
  await addStreakEntry(
    streak.id,
    ownerId,
    circleId,
    { action: "log", day: "2026-10-08" },
    at("2026-10-08", 20),
  );
  detail = await getStreakDetail(
    circleId,
    streak.id,
    ownerId,
    at("2026-10-08", 21),
  );
  expect(detail?.streak.summary.current).toBe(2);
  expect(detail?.history.filter((day) => day.state === "off")).toHaveLength(2);
  await changeStreak(
    streak.id,
    ownerId,
    circleId,
    { action: "pause", length: "manual" },
    at("2026-10-08", 22),
  );
  await changeStreak(
    streak.id,
    ownerId,
    circleId,
    { action: "resume" },
    at("2026-10-08", 23),
  );
  expect(
    (await getStreakDetail(circleId, streak.id, ownerId, at("2026-10-09")))
      ?.streak.break,
  ).toBeNull();
});

test("pause is owner-only, idempotent, preserves clean days, and cannot hide slips", async () => {
  const streak = await createStreak(
    ownerId,
    circleId,
    quitInput("Honest break", { visibility: "PRIVATE" }),
    at(monday),
  );
  const pause = { action: "pause", length: "manual" };
  await expect(
    changeStreak(streak.id, friendId, circleId, pause, at(monday)),
  ).rejects.toThrow("not found");
  await addStreakEntry(
    streak.id,
    ownerId,
    circleId,
    { action: "slip" },
    at("2026-10-07", 10),
  );
  await Promise.all([
    changeStreak(streak.id, ownerId, circleId, pause, at("2026-10-07", 11)),
    changeStreak(streak.id, ownerId, circleId, pause, at("2026-10-07", 11)),
  ]);
  expect(
    await prisma.streakBreak.count({ where: { streakId: streak.id } }),
  ).toBe(1);
  const detail = await getStreakDetail(
    circleId,
    streak.id,
    ownerId,
    at("2026-10-20"),
  );
  expect(detail?.streak.summary.current).toBe(0);
  expect(detail?.streak.summary.slips).toBe(1);
  expect(detail?.history.find((day) => day.day === monday)?.state).toBe("done");
  expect(detail?.history.find((day) => day.day === "2026-10-07")?.state).toBe(
    "slipped",
  );
  await changeStreak(
    streak.id,
    ownerId,
    circleId,
    { action: "retire" },
    at("2026-10-20"),
  );
  await expect(
    changeStreak(
      streak.id,
      ownerId,
      circleId,
      { action: "resume" },
      at("2026-10-21"),
    ),
  ).rejects.toThrow("Retired");
  await deleteStreak(streak.id, ownerId, circleId);
  expect(
    await prisma.streakBreak.count({ where: { streakId: streak.id } }),
  ).toBe(0);
  expect(
    await prisma.streakSchedule.count({ where: { streakId: streak.id } }),
  ).toBe(0);
});

test("paused and unscheduled days do not produce reminders", async () => {
  const userId = "streak-off-reminders";
  await prisma.user.create({
    data: { id: userId, name: "Off days", email: `${userId}@example.invalid` },
  });
  await prisma.membership.create({ data: { userId, circleId } });
  const streak = await createStreak(
    userId,
    circleId,
    quitInput("Quiet break", { kind: "BUILD" }),
    at(monday),
  );
  await changeStreak(
    streak.id,
    userId,
    circleId,
    { action: "pause", length: "manual" },
    at(monday),
  );
  await createStreak(
    userId,
    circleId,
    quitInput("Weekdays only", { weekdays: [1, 2, 3, 4, 5] }),
    at("2026-10-10"),
  );
  await sendStreakReminders(at("2026-10-11", 23));
  expect(
    await prisma.notification.count({
      where: { recipientId: userId, kind: "STREAK_REMINDER" },
    }),
  ).toBe(0);
  await changeStreak(
    streak.id,
    userId,
    circleId,
    { action: "resume" },
    at("2026-10-12"),
  );
  await sendStreakReminders(at("2026-10-12", 23));
  expect(
    await prisma.notification.count({
      where: { recipientId: userId, kind: "STREAK_REMINDER" },
    }),
  ).toBe(1);
});

test("backdated slips and undo recompute automatic days without losing saved amounts", async () => {
  const streak = await createStreak(
    ownerId,
    circleId,
    quitInput("Savings", {
      dailyCostCents: 500,
      dailyUnits: 300,
      unitLabel: "cups",
    }),
    at(monday, 10),
  );
  const now = at("2026-10-06", 12);
  const slipped = await addStreakEntry(
    streak.id,
    ownerId,
    circleId,
    {
      action: "slip",
      occurredAt: `${monday}T22:00`,
    },
    now,
  );
  expect(slipped.summary.current).toBe(0);
  expect(slipped.summary.allTime.costCents).toBe(0);
  await changeStreak(
    streak.id,
    ownerId,
    circleId,
    {
      action: "details",
      title: "Savings",
      dailyCostCents: 900,
      dailyUnits: 400,
      unitLabel: "cups",
    },
    now,
  );
  if (!slipped.entry) throw new Error("Missing slip entry");
  await removeStreakEntry(streak.id, slipped.entry.id, ownerId, circleId, now);
  const restored = await getStreakDetail(circleId, streak.id, ownerId, now);
  expect(restored?.streak.summary.current).toBe(1);
  expect(restored?.streak.summary.run).toEqual({ costCents: 500, units: 300 });
  expect(restored?.history[0].entries.every((entry) => !entry.canUndo)).toBe(
    true,
  );
  const tomorrow = await getStreakDetail(
    circleId,
    streak.id,
    ownerId,
    at("2026-10-07", 12),
  );
  expect(tomorrow?.streak.summary.run).toEqual({ costCents: 1400, units: 700 });
  await expect(nudgeStreak(streak.id, friendId, circleId, now)).rejects.toThrow(
    "caught up",
  );
  expect(
    (await getStreaksNeedingLog(circleId, ownerId, now)).some(
      (view) => view.id === streak.id,
    ),
  ).toBe(false);
});
