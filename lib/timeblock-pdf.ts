import { grayscale, PDFDocument, StandardFonts } from "pdf-lib";
import { appTimeZone } from "@/lib/time";
import { timeblockWeek } from "@/lib/timeblocks";

export type TimeblockPdfTask = {
  id: string;
  title: string;
  startedAt: Date;
  completedAt: Date;
};

const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
const INK = grayscale(0.12);
const MUTED = grayscale(0.42);
const LINE = grayscale(0.74);
const LIGHT_LINE = grayscale(0.88);

function safeText(value: string) {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "?");
}

function ellipsize(
  text: string,
  maxWidth: number,
  font: { widthOfTextAtSize(text: string, size: number): number },
  size: number,
) {
  const clean = safeText(text);
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let output = clean;
  while (
    output.length > 0 &&
    font.widthOfTextAtSize(`${output}...`, size) > maxWidth
  ) {
    output = output.slice(0, -1);
  }
  return `${output.trimEnd()}...`;
}

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: appTimeZone,
  weekday: "short",
  month: "short",
  day: "numeric",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: appTimeZone,
  month: "short",
  day: "numeric",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: appTimeZone,
  hour: "numeric",
  minute: "2-digit",
});

function formatHour(hour: number) {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  return `${hour % 12} ${hour < 12 ? "AM" : "PM"}`;
}

function minutesIntoPhoenixDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: appTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return (value("hour") % 24) * 60 + value("minute");
}

function drawPageFooter(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  pageNumber: number,
) {
  page.drawText(`Page ${pageNumber} of 2`, {
    x: PAGE_WIDTH - 78,
    y: 18,
    size: 7,
    font,
    color: MUTED,
  });
}

export async function createTimeblockPdf(input: {
  studentName: string;
  dueMonday: string;
  tasks: TimeblockPdfTask[];
}) {
  const week = timeblockWeek(input.dueMonday);
  const document = await PDFDocument.create();
  document.setTitle(`Timeblock due ${input.dueMonday}`);
  document.setAuthor(safeText(input.studentName));
  document.setSubject("Weekly task list and timeblock schedule");
  document.setCreator("Pickle Balls");

  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const tasks = [...input.tasks].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
  );

  const front = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  front.drawText("WEEKLY TIMEBLOCK", {
    x: 42,
    y: 548,
    size: 25,
    font: bold,
    color: INK,
  });
  front.drawText(safeText(input.studentName), {
    x: 42,
    y: 522,
    size: 12,
    font: bold,
    color: INK,
  });
  front.drawText(
    `Week of ${dateFormatter.format(week.startAt)} - ${dateFormatter.format(new Date(week.endAtExclusive.getTime() - 1))}`,
    { x: 42, y: 503, size: 9, font: regular, color: MUTED },
  );
  front.drawText(`Due Monday, ${dateFormatter.format(week.endAtExclusive)}`, {
    x: 42,
    y: 488,
    size: 9,
    font: regular,
    color: MUTED,
  });
  front.drawLine({
    start: { x: 42, y: 472 },
    end: { x: PAGE_WIDTH - 42, y: 472 },
    thickness: 1.2,
    color: INK,
  });
  front.drawText("TASK LIST", {
    x: 42,
    y: 449,
    size: 9,
    font: bold,
    color: MUTED,
  });

  if (tasks.length === 0) {
    front.drawText("No completed tasks were added for this week.", {
      x: 42,
      y: 414,
      size: 12,
      font: regular,
      color: MUTED,
    });
  } else {
    const rowsPerColumn = 14;
    const columnCount = Math.max(
      1,
      Math.min(4, Math.ceil(tasks.length / rowsPerColumn)),
    );
    const gap = 22;
    const usableWidth = PAGE_WIDTH - 84 - gap * (columnCount - 1);
    const columnWidth = usableWidth / columnCount;
    tasks.forEach((task, index) => {
      const column = Math.floor(index / rowsPerColumn);
      const row = index % rowsPerColumn;
      const x = 42 + column * (columnWidth + gap);
      const y = 418 - row * 29;
      front.drawText(`${index + 1}.`, {
        x,
        y,
        size: 10,
        font: bold,
        color: INK,
      });
      front.drawText(ellipsize(task.title, columnWidth - 25, regular, 10), {
        x: x + 20,
        y,
        size: 10,
        font: regular,
        color: INK,
      });
      const schedule = `${dayFormatter.format(task.completedAt)} | ${timeFormatter.format(task.startedAt)}-${timeFormatter.format(task.completedAt)}`;
      front.drawText(ellipsize(schedule, columnWidth - 25, regular, 7.2), {
        x: x + 20,
        y: y - 11,
        size: 7.2,
        font: regular,
        color: MUTED,
      });
    });
  }
  front.drawText(
    "Print double-sided in landscape orientation; flip on the long edge.",
    {
      x: 42,
      y: 18,
      size: 7,
      font: regular,
      color: MUTED,
    },
  );
  drawPageFooter(front, regular, 1);

  const back = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  back.drawText("WEEKLY SCHEDULE", {
    x: 42,
    y: 566,
    size: 18,
    font: bold,
    color: INK,
  });
  back.drawText(
    `${safeText(input.studentName)} | ${dateFormatter.format(week.startAt)} - ${dateFormatter.format(new Date(week.endAtExclusive.getTime() - 1))}`,
    { x: 42, y: 549, size: 8, font: regular, color: MUTED },
  );

  const gridLeft = 55;
  const gridRight = PAGE_WIDTH - 32;
  const gridTop = 512;
  const gridBottom = 38;
  const gridWidth = gridRight - gridLeft;
  const gridHeight = gridTop - gridBottom;
  const dayWidth = gridWidth / 7;
  const hourHeight = gridHeight / 24;

  for (let day = 0; day < 7; day += 1) {
    const dayStart = new Date(week.startAt.getTime() + day * 86_400_000);
    const label = dayFormatter.format(dayStart);
    const labelWidth = bold.widthOfTextAtSize(label, 8);
    back.drawText(label, {
      x: gridLeft + day * dayWidth + (dayWidth - labelWidth) / 2,
      y: gridTop + 10,
      size: 8,
      font: bold,
      color: INK,
    });
  }

  for (let hour = 0; hour <= 24; hour += 1) {
    const y = gridTop - hour * hourHeight;
    back.drawLine({
      start: { x: gridLeft, y },
      end: { x: gridRight, y },
      thickness: hour % 6 === 0 ? 0.85 : 0.35,
      color: hour % 6 === 0 ? LINE : LIGHT_LINE,
    });
    const label = formatHour(hour);
    back.drawText(label, {
      x: gridLeft - regular.widthOfTextAtSize(label, 6.2) - 5,
      y: y - 2.2,
      size: 6.2,
      font: regular,
      color: MUTED,
    });
  }
  for (let day = 0; day <= 7; day += 1) {
    const x = gridLeft + day * dayWidth;
    back.drawLine({
      start: { x, y: gridBottom },
      end: { x, y: gridTop },
      thickness: day === 0 || day === 7 ? 0.85 : 0.45,
      color: day === 0 || day === 7 ? LINE : LIGHT_LINE,
    });
  }

  type Segment = {
    task: TimeblockPdfTask;
    number: number;
    start: number;
    end: number;
    lane: number;
  };
  const segmentsByDay: Segment[][] = Array.from({ length: 7 }, () => []);
  tasks.forEach((task, taskIndex) => {
    for (let day = 0; day < 7; day += 1) {
      const dayStart = new Date(week.startAt.getTime() + day * 86_400_000);
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      const segmentStart = Math.max(
        task.startedAt.getTime(),
        dayStart.getTime(),
      );
      const segmentEnd = Math.min(task.completedAt.getTime(), dayEnd.getTime());
      if (segmentStart >= segmentEnd) continue;
      const startDate = new Date(segmentStart);
      const endDate = new Date(segmentEnd);
      const start =
        segmentStart === dayStart.getTime()
          ? 0
          : minutesIntoPhoenixDay(startDate);
      const end =
        segmentEnd === dayEnd.getTime() ? 1440 : minutesIntoPhoenixDay(endDate);
      segmentsByDay[day].push({
        task,
        number: taskIndex + 1,
        start,
        end,
        lane: 0,
      });
    }
  });

  segmentsByDay.forEach((segments, day) => {
    segments.sort((a, b) => a.start - b.start || a.end - b.end);
    const laneEnds: number[] = [];
    for (const segment of segments) {
      let lane = laneEnds.findIndex((end) => end <= segment.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = segment.end;
      segment.lane = lane;
    }
    const laneCount = Math.max(1, laneEnds.length);
    const laneWidth = (dayWidth - 2) / laneCount;
    for (const segment of segments) {
      const blockTop = gridTop - (segment.start / 1440) * gridHeight;
      const blockBottom = gridTop - (segment.end / 1440) * gridHeight;
      const height = Math.max(4.5, blockTop - blockBottom);
      const x = gridLeft + day * dayWidth + 1 + segment.lane * laneWidth;
      const width = Math.max(4, laneWidth - 1);
      back.drawRectangle({
        x,
        y: blockBottom,
        width,
        height,
        color: grayscale(0.9 + (segment.number % 3) * 0.025),
        borderColor: grayscale(0.3),
        borderWidth: 0.55,
      });
      const label =
        height >= 11 && width >= 30
          ? `#${segment.number} ${segment.task.title}`
          : `#${segment.number}`;
      back.drawText(ellipsize(label, width - 4, bold, 6.2), {
        x: x + 2,
        y: blockBottom + Math.max(1.5, height - 7.4),
        size: 6.2,
        font: bold,
        color: INK,
      });
    }
  });

  back.drawText(
    `Due ${dateFormatter.format(week.endAtExclusive)} | Task numbers match page 1`,
    { x: 42, y: 18, size: 7, font: regular, color: MUTED },
  );
  drawPageFooter(back, regular, 2);

  return document.save();
}
