import {
  formatStreakMoney,
  formatStreakUnits,
  type StreakKind,
} from "@/lib/streak-policy";

export function daysLabel(count: number) {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

export function milestoneSummary(kind: StreakKind, count: number) {
  return `${daysLabel(count)} ${kind === "QUIT" ? "clean" : "in a row"}`;
}

export function countLabel(kind: StreakKind, count: number) {
  return kind === "QUIT"
    ? count === 1
      ? "day clean"
      : "days clean"
    : count === 1
      ? "day in a row"
      : "days in a row";
}

// "$150 saved", "90 cups skipped", or "300 pages".
export function totalsParts(
  kind: StreakKind,
  totals: { costCents?: number | null; units?: number | null },
  unitLabel: string | null,
) {
  const parts: string[] = [];
  if (kind === "QUIT" && totals.costCents)
    parts.push(`${formatStreakMoney(totals.costCents)} saved`);
  if (unitLabel && totals.units)
    parts.push(
      kind === "QUIT"
        ? `${formatStreakUnits(totals.units, unitLabel)} skipped`
        : formatStreakUnits(totals.units, unitLabel),
    );
  return parts;
}
