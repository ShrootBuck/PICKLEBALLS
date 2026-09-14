import { grayscale, PDFDocument, type PDFFont, StandardFonts } from "pdf-lib";
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

const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
const MARGIN = 32;
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

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: appTimeZone,
  weekday: "long",
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

type PrintBlock = { label: string; time: string; routine: boolean };

export function timeblockPrintDays(input: {
  dueMonday: string;
  tasks: TimeblockPdfTask[];
  routine?: TimeblockRoutine;
}) {
  const week = timeblockWeek(input.dueMonday);
  const tasks = [...input.tasks].sort(
    (a, b) =>
      a.startedAt.getTime() - b.startedAt.getTime() || a.id.localeCompare(b.id),
  );
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
  // the full name in PDF metadata. Work and class titles are never shortened.
  const headerName = nameLines[0] + (nameLines.length > 1 ? "..." : "");

  // Four wide day columns, then three. Text determines block height, so even a
  // five-minute activity has room for its full title. Dense days continue onto
  // additional calendar pages instead of shrinking the font or dropping text.
  for (const group of [days.slice(0, 4), days.slice(4)]) {
    const gap = 10;
    const width =
      (PAGE_WIDTH - 2 * MARGIN - gap * (group.length - 1)) / group.length;
    const cursors = group.map(() => 0);
    let continuation = false;
    do {
      const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      page.drawText("WEEKLY TIMEBLOCK", {
        x: MARGIN,
        y: 578,
        size: 22,
        font: bold,
        color: INK,
      });
      page.drawText(headerName, {
        x: MARGIN,
        y: 557,
        size: 11,
        font: bold,
        color: INK,
      });
      page.drawText(
        `${weekLabel} | Due Monday, ${dateFormatter.format(week.endAtExclusive)}`,
        { x: MARGIN, y: 540, size: 8.5, font: regular, color: MUTED },
      );
      page.drawText(`For Ms. Merrill${continuation ? " | Continued" : ""}`, {
        x: 610,
        y: 580,
        size: 8,
        font: regular,
        color: MUTED,
      });
      group.forEach((day, index) => {
        const x = MARGIN + index * (width + gap);
        page.drawRectangle({
          x,
          y: 510,
          width,
          height: 22,
          color: grayscale(0.9),
        });
        page.drawText(dayFormatter.format(day.date), {
          x: x + 8,
          y: 518,
          size: 9,
          font: bold,
          color: INK,
        });
        let top = 502;
        if (day.blocks.length === 0 || cursors[index] >= day.blocks.length) {
          page.drawText(
            day.blocks.length === 0
              ? "No blocks added."
              : "Complete on previous page.",
            { x: x + 8, y: top - 14, size: 8, font: regular, color: MUTED },
          );
        }
        while (cursors[index] < day.blocks.length) {
          const block = day.blocks[cursors[index]];
          const titleLines = wrapPdfText(block.label, width - 16, bold, 9);
          const timeLines = wrapPdfText(block.time, width - 16, regular, 7.5);
          const height = 11 + titleLines.length * 10 + timeLines.length * 8;
          if (top - height < 40) break;
          page.drawRectangle({
            x,
            y: top - height,
            width,
            height,
            color: grayscale(block.routine ? 0.96 : 1),
            borderColor: grayscale(0.68),
            borderWidth: 0.5,
          });
          let baseline = top - 12;
          for (const line of titleLines) {
            page.drawText(line, {
              x: x + 8,
              y: baseline,
              size: 9,
              font: bold,
              color: INK,
            });
            baseline -= 10;
          }
          for (const line of timeLines) {
            page.drawText(line, {
              x: x + 8,
              y: baseline,
              size: 7.5,
              font: regular,
              color: MUTED,
            });
            baseline -= 8;
          }
          top -= height + 3;
          cursors[index]++;
        }
        if (cursors[index] < day.blocks.length)
          page.drawText("Continues on next page", {
            x: x + 8,
            y: 29,
            size: 7,
            font: bold,
            color: MUTED,
          });
      });
      continuation = true;
    } while (group.some((day, index) => cursors[index] < day.blocks.length));
  }
  const pages = document.getPages();
  pages.forEach((page, index) => {
    page.drawText(
      "Phoenix time | Blocks in time order; heights fit titles. Shaded blocks: school & sleep.",
      { x: MARGIN, y: 18, size: 7, font: regular, color: MUTED },
    );
    page.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: PAGE_WIDTH - 85,
      y: 18,
      size: 7,
      font: regular,
      color: MUTED,
    });
  });
  return document.save();
}
