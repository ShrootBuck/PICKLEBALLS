import {
  Duplex,
  grayscale,
  PDFDocument,
  type PDFFont,
  PrintScaling,
  StandardFonts,
} from "pdf-lib";
import { DomainError } from "@/lib/errors";
import { appTimeZone, parsePhoenixLocalDateTime } from "@/lib/time";
import {
  EMPTY_ROUTINE,
  routineBlocks,
  type TimeblockRoutine,
} from "@/lib/timeblock-routine";
import { timeblockWeek } from "@/lib/timeblocks";

export type TimeblockPdfTask = {
  id: string;
  title: string;
  startedAt: Date;
  completedAt: Date;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 28;
const INK = grayscale(0.12);
const MUTED = grayscale(0.4);

export function safePdfText(value: string) {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

// Wrap every character, including long unbroken words, without truncating titles.
export function wrapPdfText(
  text: string,
  width: number,
  font: PDFFont,
  size: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of safePdfText(text).split(/\s+/)) {
    if (line && font.widthOfTextAtSize(`${line} ${word}`, size) <= width) {
      line += ` ${word}`;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const character of word) {
      if (line && font.widthOfTextAtSize(line + character, size) > width) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

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

type PrintBlock = {
  label: string;
  time: string;
  routine: boolean;
  startMinute: number;
  endMinute: number;
};

export function orderedPrintTasks(tasks: TimeblockPdfTask[]) {
  return [...tasks].sort(
    (a, b) =>
      a.startedAt.getTime() - b.startedAt.getTime() || a.id.localeCompare(b.id),
  );
}

export function timeblockPrintDays(input: {
  dueMonday: string;
  tasks: TimeblockPdfTask[];
  routine?: TimeblockRoutine;
}) {
  const week = timeblockWeek(input.dueMonday);
  const tasks = orderedPrintTasks(input.tasks);
  const blocks = [
    ...tasks.map((task, index) => ({
      ...task,
      label: `#${index + 1} - ${task.title}`,
      routine: false,
    })),
    ...routineBlocks(input.dueMonday, input.routine ?? EMPTY_ROUTINE).map(
      (row) => {
        const startedAt = parsePhoenixLocalDateTime(row.startedAt);
        const completedAt = parsePhoenixLocalDateTime(row.completedAt);
        if (!startedAt || !completedAt)
          throw new Error("Invalid school or sleep time.");
        return {
          id: row.id,
          title: row.title,
          label: row.title,
          routine: true,
          startedAt,
          completedAt,
        };
      },
    ),
  ].sort(
    (a, b) =>
      a.startedAt.getTime() - b.startedAt.getTime() || a.id.localeCompare(b.id),
  );
  return Array.from({ length: 7 }, (_, day) => {
    const start = week.startAt.getTime() + day * 86_400_000;
    const end = start + 86_400_000;
    return {
      date: new Date(start),
      blocks: blocks
        .filter(
          (block) =>
            block.startedAt.getTime() < end &&
            block.completedAt.getTime() > start,
        )
        .map(
          (block): PrintBlock => ({
            startMinute:
              (Math.max(start, block.startedAt.getTime()) - start) / 60_000,
            endMinute:
              (Math.min(end, block.completedAt.getTime()) - start) / 60_000,
            label: block.label,
            routine: block.routine,
            time: `${timeFormatter.format(new Date(Math.max(start, block.startedAt.getTime())))} - ${block.completedAt.getTime() >= end ? "midnight" : timeFormatter.format(block.completedAt)}${block.startedAt.getTime() < start ? " (continued)" : ""}`,
          }),
        ),
    };
  });
}

export async function createTimeblockPdf(input: {
  studentName: string;
  dueMonday: string;
  tasks: TimeblockPdfTask[];
  routine?: TimeblockRoutine;
}) {
  const week = timeblockWeek(input.dueMonday);
  const document = await PDFDocument.create();
  document.setTitle(`Timeblock due ${input.dueMonday}`);
  document.setAuthor(safePdfText(input.studentName));
  document.setSubject(
    "Weekly school, sleep, and work schedule for Ms. Merrill",
  );
  document.setCreator("Pickle Balls");
  const viewer = document.catalog.getOrCreateViewerPreferences();
  viewer.setDuplex(Duplex.DuplexFlipLongEdge);
  viewer.setPrintScaling(PrintScaling.None);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const days = timeblockPrintDays(input);
  const weekLabel = `${dateFormatter.format(week.startAt)} - ${dateFormatter.format(new Date(week.endAtExclusive.getTime() - 1))}`;
  const nameLines = wrapPdfText(
    input.studentName,
    PAGE_WIDTH - 2 * MARGIN,
    bold,
    11,
  );
  // Keep headers bounded for exceptionally long account names while preserving
  // the full name in PDF metadata. Full task titles appear on the front.
  const headerName = nameLines[0] + (nameLines.length > 1 ? "..." : "");

  const header = (title: string, landscape = false) => {
    const height = landscape ? PAGE_WIDTH : PAGE_HEIGHT;
    const page = document.addPage(
      landscape ? [PAGE_HEIGHT, PAGE_WIDTH] : [PAGE_WIDTH, PAGE_HEIGHT],
    );
    page.drawText(title, {
      x: MARGIN,
      y: height - 44,
      size: 20,
      font: bold,
      color: INK,
    });
    page.drawText(headerName, {
      x: MARGIN,
      y: height - 64,
      size: 11,
      font: bold,
      color: INK,
    });
    page.drawText(weekLabel, {
      x: MARGIN,
      y: height - 80,
      size: 9,
      font: regular,
      color: MUTED,
    });
    return page;
  };
  const tasks = orderedPrintTasks(input.tasks);
  const front = header("WEEKLY TASKS");
  const listTop = 688;
  const listBottom = 32;
  const gap = 16;
  const taskDay = new Intl.DateTimeFormat("en-US", {
    timeZone: appTimeZone,
    weekday: "short",
  });
  const entries = tasks.map((task, index) => ({
    title: `#${index + 1}  ${task.title}`,
    time: `${taskDay.format(task.startedAt)} | ${timeFormatter.format(task.startedAt)} - ${dateFormatter.format(task.startedAt) === dateFormatter.format(task.completedAt) ? "" : `${taskDay.format(task.completedAt)} `}${timeFormatter.format(task.completedAt)}`,
  }));
  // Keep full titles, and never create overflow pages or silently omit work.
  // Try readable layouts before rejecting an overfull sheet.
  let layout:
    | {
        columns: number;
        size: number;
        width: number;
        rows: {
          title: string[];
          time: string[];
          height: number;
          column: number;
        }[];
      }
    | undefined;
  for (const size of [10, 9, 8]) {
    const columns = 2;
    const width = (PAGE_WIDTH - MARGIN * 2 - gap) / columns;
    const rows = entries.map((entry) => {
      const title = wrapPdfText(entry.title, width - 8, bold, size);
      const time = wrapPdfText(entry.time, width - 8, regular, size - 1);
      const height = title.length * (size + 2) + time.length * (size + 1) + 3;
      return { title, time, height, column: 0 };
    });
    // Fill the left column before flowing into the right. Keep each task
    // together, moving it only when its full row cannot fit below the last.
    const capacity = listTop - listBottom;
    let column = 0;
    let remaining = capacity;
    for (const row of rows) {
      if (row.height > remaining) {
        column++;
        remaining = capacity;
      }
      row.column = column;
      remaining -= row.height;
    }
    if (column < columns && rows.every((row) => row.height <= capacity)) {
      layout = { columns, size, width, rows };
      break;
    }
  }
  if (!layout)
    throw new DomainError(
      "This task list is too long to fit legibly on one sheet. Shorten task titles or exclude some tasks, then export again.",
    );
  if (!tasks.length)
    front.drawText("No tasks included for this week.", {
      x: MARGIN,
      y: listTop - 12,
      size: 10,
      font: regular,
      color: MUTED,
    });
  const tops = Array.from({ length: layout.columns }, () => listTop);
  for (const row of layout.rows) {
    const x = MARGIN + row.column * (layout.width + gap);
    let y = tops[row.column] - layout.size;
    for (const line of row.title) {
      front.drawText(line, { x, y, size: layout.size, font: bold, color: INK });
      y -= layout.size + 2;
    }
    for (const line of row.time) {
      front.drawText(line, {
        x,
        y,
        size: layout.size - 1,
        font: regular,
        color: MUTED,
      });
      y -= layout.size + 1;
    }
    tops[row.column] -= row.height;
    front.drawLine({
      start: { x, y: tops[row.column] + 1 },
      end: { x: x + layout.width - 8, y: tops[row.column] + 1 },
      color: grayscale(0.86),
      thickness: 0.4,
    });
  }

  const back = header("WEEKLY CALENDAR", true);
  const gridLeft = MARGIN + 38;
  const gridRight = PAGE_HEIGHT - MARGIN;
  const gridTop = 498;
  const gridBottom = 32;
  const gridHeight = gridTop - gridBottom;
  const dayWidth = (gridRight - gridLeft) / 7;
  const minuteY = (minute: number) => gridTop - (minute / 1440) * gridHeight;
  const shortDate = new Intl.DateTimeFormat("en-US", {
    timeZone: appTimeZone,
    month: "numeric",
    day: "numeric",
  });
  days.forEach((day, index) => {
    const x = gridLeft + index * dayWidth;
    const label = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ][index];
    back.drawText(label, {
      x: x + (dayWidth - bold.widthOfTextAtSize(label, 8)) / 2,
      y: 518,
      size: 8,
      font: bold,
      color: INK,
    });
    const date = shortDate.format(day.date);
    back.drawText(date, {
      x: x + (dayWidth - regular.widthOfTextAtSize(date, 7)) / 2,
      y: 507,
      size: 7,
      font: regular,
      color: MUTED,
    });
  });
  for (let slot = 0; slot <= 48; slot++) {
    const y = minuteY(slot * 30);
    const hour = Math.floor(slot / 2) % 24;
    const label = `${hour % 12 || 12}:${slot % 2 ? "30" : "00"}${hour < 12 ? "a" : "p"}`;
    back.drawText(label, {
      x: gridLeft - 5 - regular.widthOfTextAtSize(label, 6),
      y: y - 2,
      size: 6,
      font: regular,
      color: MUTED,
    });
    back.drawLine({
      start: { x: gridLeft, y },
      end: { x: gridRight, y },
      thickness: slot % 2 ? 0.25 : 0.5,
      color: grayscale(slot % 2 ? 0.88 : 0.7),
    });
  }
  for (let day = 0; day <= 7; day++)
    back.drawLine({
      start: { x: gridLeft + day * dayWidth, y: gridBottom },
      end: { x: gridLeft + day * dayWidth, y: gridTop },
      thickness: 0.5,
      color: grayscale(0.65),
    });

  for (const [dayIndex, day] of days.entries()) {
    // Partition connected overlap groups, then assign a separate lane to each
    // simultaneous block. Adjacent blocks can reuse a lane.
    const sorted = [...day.blocks].sort(
      (a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute,
    );
    const groups: PrintBlock[][] = [];
    let end = -1;
    for (const block of sorted) {
      if (block.startMinute >= end) {
        groups.push([]);
        end = -1;
      }
      groups[groups.length - 1].push(block);
      end = Math.max(end, block.endMinute);
    }
    const callouts: { block: PrintBlock; anchorX: number; anchorY: number }[] =
      [];
    for (const group of groups) {
      const laneEnds: number[] = [];
      const assigned = group.map((block) => {
        let lane = laneEnds.findIndex((end) => end <= block.startMinute);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = block.endMinute;
        return { block, lane };
      });
      const width = dayWidth / laneEnds.length;
      for (const { block, lane } of assigned) {
        const x = gridLeft + dayIndex * dayWidth + lane * width + 0.6;
        const top = minuteY(block.startMinute);
        const height =
          ((block.endMinute - block.startMinute) / 1440) * gridHeight;
        back.drawRectangle({
          x,
          y: top - height,
          width: width - 1.2,
          height,
          color: grayscale(block.routine ? 0.92 : 1),
          borderColor: grayscale(block.routine ? 0.65 : 0.25),
          borderWidth: 0.45,
        });
        // Titles stay within their actual time interval. Compact blocks use a
        // single label; full task titles and exact times remain on the front.
        const size = 6.5;
        const lineHeight = 7.5;
        const maxLines = Math.floor((height - 1) / lineHeight);
        if (maxLines < 1 || width < 12) {
          callouts.push({
            block,
            anchorX: x + (width - 1.2) / 2,
            anchorY: top - height / 2,
          });
          continue;
        }
        const lines = wrapPdfText(block.label, width - 5, bold, size);
        const visible = lines.slice(0, maxLines);
        if (lines.length > maxLines) {
          let last = visible[visible.length - 1];
          while (last && bold.widthOfTextAtSize(`${last}...`, size) > width - 5)
            last = last.slice(0, -1);
          visible[visible.length - 1] = `${last}...`;
        }
        visible.forEach((line, index) => {
          back.drawText(line, {
            x: x + 2,
            y: top - size - 1 - index * lineHeight,
            size,
            font: bold,
            color: INK,
          });
        });
      }
    }
    // Very short or narrow blocks cannot contain readable text at true scale.
    // Place their names in the nearest free time interval with a leader line.
    const occupied = sorted.map((block) => ({
      start: (block.startMinute / 1440) * gridHeight,
      end: (block.endMinute / 1440) * gridHeight,
    }));
    for (const { block, anchorX, anchorY } of callouts) {
      occupied.sort((a, b) => a.start - b.start);
      const gaps: { start: number; end: number }[] = [];
      let cursor = 0;
      for (const interval of occupied) {
        if (interval.start - cursor >= 9)
          gaps.push({ start: cursor, end: interval.start });
        cursor = Math.max(cursor, interval.end);
      }
      if (gridHeight - cursor >= 9)
        gaps.push({ start: cursor, end: gridHeight });
      const target = gridTop - anchorY;
      const positions = gaps.map((gap) =>
        Math.max(gap.start, Math.min(target - 4.5, gap.end - 9)),
      );
      positions.sort(
        (a, b) => Math.abs(a + 4.5 - target) - Math.abs(b + 4.5 - target),
      );
      const position = positions[0];
      if (position === undefined)
        throw new DomainError(
          "This calendar is too crowded to label on one page. Reduce overlapping or very short blocks, then export again.",
        );
      occupied.push({ start: position, end: position + 9 });
      const x = gridLeft + dayIndex * dayWidth + 2;
      const y = gridTop - position - 6.5;
      const width = dayWidth - 7;
      let label = safePdfText(block.label);
      if (bold.widthOfTextAtSize(label, 6) > width) {
        while (label && bold.widthOfTextAtSize(`${label}...`, 6) > width)
          label = label.slice(0, -1);
        label += "...";
      }
      back.drawLine({
        start: { x: anchorX, y: anchorY },
        end: { x: x + width, y: y + 2 },
        thickness: 0.4,
        color: MUTED,
      });
      back.drawRectangle({
        x,
        y: y - 1,
        width,
        height: 8,
        color: grayscale(1),
      });
      back.drawText(label, { x, y, size: 6, font: bold, color: INK });
    }
  }
  return document.save();
}
