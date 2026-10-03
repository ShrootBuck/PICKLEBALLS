import type { CSSProperties, ReactNode } from "react";
import {
  formatStreakUnits,
  type StreakDayState,
  type StreakTier,
  streakTier,
} from "@/lib/streak-policy";
import { formatDayShort } from "@/lib/time";
import { shiftDateKey } from "@/lib/timeblocks";
import { cn } from "@/lib/utils";

const outerFlame =
  "M32 4C34 14 46 20 46 36C46 49 39 58 32 58C25 58 18 49 18 37C18 29 22 24 25 19C25.5 25 28 28.5 30 29.5C29 20 30 11 32 4Z";
const innerFlame =
  "M32 24C34 31 40 35 40 43C40 50 36.5 54 32 54C27.5 54 24 50 24 44C24 39 27 36 29 33C29.5 36 31 37.5 32 38C31.5 33 31.5 28 32 24Z";
const leftTongue =
  "M22 58C15.5 55.5 12 49.5 13 43.5C13.8 38.8 16.6 35.6 19 32.5C19.2 37 20.8 40.2 23 41.5C21.8 46.5 22 52.5 24.5 57.5Z";
const rightTongue =
  "M42 58C48.5 55.5 52 49.5 51 43.5C50.2 38.8 47.4 35.6 45 32.5C44.8 37 43.2 40.2 41 41.5C42.2 46.5 42 52.5 39.5 57.5Z";

export function StreakEmber({
  count = 0,
  tier,
  size = 48,
  dim = false,
  className,
}: {
  count?: number;
  tier?: StreakTier;
  size?: number;
  dim?: boolean;
  className?: string;
}) {
  const value = tier ?? streakTier(count);
  const big = value === "blaze" || value === "inferno";
  return (
    <span
      aria-hidden="true"
      className={cn("streak-ember", className)}
      data-tier={value}
      data-dim={dim || undefined}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <g className="flame-body">
          {big && (
            <>
              <g
                className="flame-side"
                style={{ transformOrigin: "20px 58px" }}
              >
                <path className="flame-outer" d={leftTongue} />
              </g>
              <g
                className="flame-side"
                style={{
                  transformOrigin: "44px 58px",
                  animationDelay: "-0.9s",
                }}
              >
                <path className="flame-outer" d={rightTongue} />
              </g>
            </>
          )}
          <g className="flame-flicker">
            <path className="flame-outer" d={outerFlame} />
          </g>
          <g className="flame-flicker-inner">
            <path className="flame-inner" d={innerFlame} />
            <ellipse className="flame-core" cx="32" cy="48" rx="4.5" ry="6" />
          </g>
        </g>
        {value === "inferno" && (
          <>
            <circle
              className="ember-spark"
              cx="24"
              cy="22"
              r="1.6"
              style={{ "--drift": "-5px" } as CSSProperties}
            />
            <circle
              className="ember-spark"
              cx="38"
              cy="16"
              r="1.3"
              style={{ "--drift": "4px" } as CSSProperties}
            />
            <circle
              className="ember-spark"
              cx="31"
              cy="10"
              r="1.1"
              style={{ "--drift": "-2px" } as CSSProperties}
            />
          </>
        )}
      </svg>
    </span>
  );
}

export function StreakRing({
  fraction,
  size = 72,
  stroke = 4,
  children,
}: {
  fraction: number;
  size?: number;
  stroke?: number;
  children: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  return (
    <span className="streak-ring" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <circle
          className="streak-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="streak-ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - Math.min(1, Math.max(0, fraction)))}
          style={{ "--ring-length": length } as CSSProperties}
        />
      </svg>
      {children}
    </span>
  );
}

const stateLabels: Record<StreakDayState, string> = {
  done: "Done",
  slipped: "Slipped",
  missed: "Missed",
  pending: "Not logged yet",
};

export function StreakWeek({
  week,
  today,
  kind,
}: {
  week: { day: string; state: StreakDayState | null }[];
  today: string;
  kind: "QUIT" | "BUILD";
}) {
  return (
    <ol className="streak-week" aria-label="The last seven days">
      {week.map(({ day, state }) => {
        const label = formatDayShort(day);
        return (
          <li key={day} data-today={day === today || undefined}>
            <span
              className="streak-dot"
              data-state={state ?? "none"}
              role="img"
              aria-label={`${label}: ${
                state === null
                  ? "Before this streak"
                  : state === "done" && kind === "QUIT"
                    ? "Clean"
                    : stateLabels[state]
              }`}
              title={label}
            />
            <span aria-hidden="true">{label.slice(0, 2)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function StreakHeatmap({
  days,
  today,
  kind,
  unitLabel,
  weeks = 26,
}: {
  days: { day: string; state: StreakDayState; units: number }[];
  today: string;
  kind: "QUIT" | "BUILD";
  unitLabel: string | null;
  weeks?: number;
}) {
  const byDay = new Map(days.map((item) => [item.day, item]));
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const first = shiftDateKey(today, -weekday - (weeks - 1) * 7);
  const most = Math.max(1, ...days.map((item) => item.units));
  const cells = Array.from({ length: weeks * 7 }, (_, index) =>
    shiftDateKey(first, index),
  );
  const counts = { done: 0, slipped: 0, missed: 0 };
  for (const day of cells) {
    const item = byDay.get(day);
    if (item && item.state !== "pending") counts[item.state] += 1;
  }
  const monthName = (dayKey: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${dayKey}T12:00:00Z`));
  // Label the week holding each month's first day. The first column gets its
  // own month only when the next label is far enough away not to collide.
  const firsts = Array.from({ length: weeks }, (_, column) =>
    Array.from({ length: 7 }, (_, row) =>
      shiftDateKey(first, column * 7 + row),
    ).find((key) => key.endsWith("-01")),
  );
  const nextLabel = firsts.findIndex(Boolean);
  const months = firsts.map((key, column) =>
    key
      ? monthName(key)
      : column === 0 && (nextLabel === -1 || nextLabel >= 3)
        ? monthName(first)
        : "",
  );
  const doneLabel = kind === "QUIT" ? "clean" : "done";
  return (
    <figure className="flex w-full max-w-xl flex-col gap-2">
      <div
        className="grid gap-[3px] text-[10px] text-muted-foreground"
        style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {months.map((month, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: one label slot per column
          <span key={index} className="overflow-visible whitespace-nowrap">
            {month}
          </span>
        ))}
      </div>
      <div
        className="streak-heatmap"
        role="img"
        aria-label={`Last ${weeks} weeks: ${counts.done} days ${doneLabel}, ${counts.slipped} slipped, ${counts.missed} missed.`}
      >
        {cells.map((day) => {
          const item = byDay.get(day);
          const state = day > today || !item ? "outside" : item.state;
          const level =
            state === "done" && kind === "BUILD" && item?.units
              ? 40 + Math.round((item.units / most) * 60)
              : 100;
          return (
            <span
              key={day}
              className="streak-heatmap-cell"
              data-state={state}
              style={{ "--level": `${level}%` } as CSSProperties}
              title={
                state === "outside"
                  ? formatDayShort(day)
                  : `${formatDayShort(day)}: ${
                      state === "done" && kind === "QUIT"
                        ? "Clean"
                        : stateLabels[state]
                    }${
                      state === "done" && item?.units && unitLabel
                        ? ` (${formatStreakUnits(item.units, unitLabel)})`
                        : ""
                    }`
              }
            />
          );
        })}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(
          [
            ["done", kind === "QUIT" ? "Clean" : "Done"],
            ["slipped", "Slipped"],
            ["missed", "Missed"],
            ["pending", "Waiting for a log"],
          ] as const
        )
          .filter(([state]) => kind === "QUIT" || state !== "slipped")
          .map(([state, label]) => (
            <span key={state} className="flex items-center gap-1.5">
              <span
                className="streak-heatmap-cell size-2.5"
                data-state={state}
              />
              {label}
            </span>
          ))}
      </figcaption>
    </figure>
  );
}
