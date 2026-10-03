import { getPrisma } from "@/lib/prisma";
import { phoenixDateKey, phoenixWallToDate, requireDateKey } from "@/lib/time";
import { shiftDateKey } from "@/lib/timeblocks";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error("Fixtures require the disposable runner.");
const prisma = getPrisma();
const circleId = "demo-circle";
const today = phoenixDateKey();
const day = (offset: number) => shiftDateKey(today, offset);
const at = (offset: number, hour: number, minute = 0) =>
  phoenixWallToDate(day(offset), hour, minute, 0, 0) as Date;
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

type Fixture = {
  id: string;
  userId: string;
  title: string;
  emoji: string;
  kind: "QUIT" | "BUILD";
  visibility: "CIRCLE" | "PRIVATE";
  started: number;
  retired?: number;
  dailyCostCents?: number;
  dailyUnits?: number;
  unitLabel?: string;
  clean?: number[];
  slips?: { offset: number; hour: number; minute: number; note: string }[];
  logs?: { offset: number; units?: number; note?: string }[];
  events: {
    kind: "STARTED" | "MILESTONE" | "RETIRED";
    count: number;
    at: Date;
    dedupeKey: string;
    costCents?: number;
    units?: number;
  }[];
};

const fixtures: Fixture[] = [
  {
    id: "demo-streak-caffeine",
    userId: "demo-you",
    title: "No caffeine",
    emoji: "☕",
    kind: "QUIT",
    visibility: "CIRCLE",
    started: -40,
    dailyCostCents: 500,
    dailyUnits: 300,
    unitLabel: "cups",
    clean: [...range(-40, -15), ...range(-13, -2)],
    slips: [
      {
        offset: -14,
        hour: 15,
        minute: 10,
        note: "Afternoon slump. Grabbed one at the library.",
      },
    ],
    events: [
      { kind: "STARTED", count: 0, at: at(-40, 9), dedupeKey: "started" },
      {
        kind: "MILESTONE",
        count: 7,
        at: at(-33, 8, 30),
        dedupeKey: `milestone:7:${day(-40)}`,
        costCents: 3500,
        units: 2100,
      },
      {
        kind: "MILESTONE",
        count: 7,
        at: at(-6, 8, 30),
        dedupeKey: `milestone:7:${day(-13)}`,
        costCents: 3500,
        units: 2100,
      },
    ],
  },
  {
    id: "demo-streak-reading",
    userId: "demo-you",
    title: "Read every day",
    emoji: "📖",
    kind: "BUILD",
    visibility: "PRIVATE",
    started: -9,
    dailyUnits: 1000,
    unitLabel: "pages",
    logs: [10, 25, 12, 30, 8, 15, 20, 10, 40].map((pages, index) => ({
      offset: index - 9,
      units: pages * 100,
      note: index === 3 ? "Finished chapter four." : undefined,
    })),
    events: [],
  },
  {
    id: "demo-streak-gym",
    userId: "demo-eddie",
    title: "Gym",
    emoji: "🏋️",
    kind: "BUILD",
    visibility: "CIRCLE",
    started: -20,
    logs: range(-20, -2).map((offset) => ({ offset })),
    events: [
      { kind: "STARTED", count: 0, at: at(-20, 7), dedupeKey: "started" },
      {
        kind: "MILESTONE",
        count: 7,
        at: at(-14, 19),
        dedupeKey: `milestone:7:${day(-20)}`,
      },
    ],
  },
  {
    id: "demo-streak-scrolling",
    userId: "demo-sam",
    title: "No doomscrolling",
    emoji: "📱",
    kind: "QUIT",
    visibility: "CIRCLE",
    started: -4,
    clean: range(-4, -1),
    events: [
      { kind: "STARTED", count: 0, at: at(-4, 11), dedupeKey: "started" },
    ],
  },
  {
    id: "demo-streak-meditate",
    userId: "demo-jules",
    title: "Meditate",
    emoji: "🧘",
    kind: "BUILD",
    visibility: "CIRCLE",
    started: -104,
    dailyUnits: 1000,
    unitLabel: "minutes",
    logs: range(-104, 0).map((offset) => ({ offset })),
    events: [
      { kind: "STARTED", count: 0, at: at(-104, 6), dedupeKey: "started" },
      ...[7, 30, 60, 100].map((count) => ({
        kind: "MILESTONE" as const,
        count,
        at: at(count - 105, 20),
        dedupeKey: `milestone:${count}:${day(-104)}`,
        units: count * 1000,
      })),
    ],
  },
  {
    id: "demo-streak-soda",
    userId: "demo-you",
    title: "No soda",
    emoji: "🥤",
    kind: "QUIT",
    visibility: "CIRCLE",
    started: -80,
    retired: -49,
    dailyCostCents: 250,
    clean: range(-80, -50),
    events: [
      { kind: "STARTED", count: 0, at: at(-80, 9), dedupeKey: "started" },
      {
        kind: "MILESTONE",
        count: 7,
        at: at(-73, 8),
        dedupeKey: `milestone:7:${day(-80)}`,
        costCents: 1750,
      },
      {
        kind: "MILESTONE",
        count: 30,
        at: at(-50, 8),
        dedupeKey: `milestone:30:${day(-80)}`,
        costCents: 7500,
      },
      {
        kind: "RETIRED",
        count: 31,
        at: at(-49, 10),
        dedupeKey: "retired",
        costCents: 7750,
      },
    ],
  },
];

for (const fixture of fixtures) {
  await prisma.streak.create({
    data: {
      id: fixture.id,
      userId: fixture.userId,
      circleId,
      title: fixture.title,
      emoji: fixture.emoji,
      kind: fixture.kind,
      visibility: fixture.visibility,
      status: fixture.retired === undefined ? "ACTIVE" : "RETIRED",
      startedAt: at(fixture.started, 9),
      retiredAt: fixture.retired === undefined ? null : at(fixture.retired, 10),
      dailyCostCents: fixture.dailyCostCents ?? null,
      dailyUnits: fixture.dailyUnits ?? null,
      unitLabel: fixture.unitLabel ?? null,
      createdAt: at(fixture.started, 9),
    },
  });
  await prisma.streakEntry.createMany({
    data: [
      ...(fixture.clean ?? []).map((offset) => ({
        streakId: fixture.id,
        day: requireDateKey(day(offset)),
        kind: "CLEAN" as const,
        occurredAt: at(offset + 1, 8, 30),
        costCents: fixture.dailyCostCents ?? null,
        units: fixture.dailyUnits ?? null,
      })),
      ...(fixture.slips ?? []).map((slip) => ({
        streakId: fixture.id,
        day: requireDateKey(day(slip.offset)),
        kind: "SLIP" as const,
        occurredAt: at(slip.offset, slip.hour, slip.minute),
        note: slip.note,
      })),
      ...(fixture.logs ?? []).map((log) => ({
        streakId: fixture.id,
        day: requireDateKey(day(log.offset)),
        kind: "LOG" as const,
        occurredAt: at(log.offset, 20),
        units: log.units ?? fixture.dailyUnits ?? null,
        note: log.note ?? null,
      })),
    ],
  });
  if (fixture.visibility === "CIRCLE")
    for (const [index, event] of fixture.events.entries())
      await prisma.streakEvent.create({
        data: {
          id: `${fixture.id}-event-${index}`,
          streakId: fixture.id,
          userId: fixture.userId,
          circleId,
          kind: event.kind,
          count: event.count,
          costCents: event.costCents ?? null,
          units: event.units ?? null,
          dedupeKey: event.dedupeKey,
          createdAt: event.at,
        },
      });
}
const comeback = await prisma.streakEvent.findFirstOrThrow({
  where: {
    streakId: "demo-streak-caffeine",
    dedupeKey: `milestone:7:${day(-13)}`,
  },
});
await prisma.postLike.createMany({
  data: ["demo-eddie", "demo-sam"].map((userId) => ({
    userId,
    circleId,
    streakEventId: comeback.id,
  })),
});
await prisma.socialReply.create({
  data: {
    authorId: "demo-eddie",
    circleId,
    streakEventId: comeback.id,
    body: "A week back on track after the slip. That’s the hard part.",
    createdAt: at(-6, 12),
  },
});
console.log(`Seeded ${fixtures.length} streaks.`);
