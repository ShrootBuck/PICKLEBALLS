import { type CSSProperties, type ReactNode, useId } from "react";
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
  "M36 3C39 17 25 21 29 33C35 30 39 24 39 19C49 28 54 37 51 46C48 55 40 60 31 60C18 60 10 51 12 40C13 33 18 27 22 23C20 31 21 36 25 38C20 21 34 17 36 3Z";
const innerFlame =
  "M36 28C37 37 28 39 29 46C33 45 36 41 37 38C43 43 44 48 41 53C39 57 35 59 31 59C24 59 19 54 20 48C20 43 23 39 25 37C24 43 25 46 27 47C25 38 33 35 36 28Z";
const leftTongue =
  "M20 58C11.5 54.5 7.5 46.5 9.5 38.5C10.8 33.2 14.8 30 17.5 26C18.4 31.5 20.8 35.5 23.5 37C21.5 43 21.8 51 25.5 57Z";
const rightTongue =
  "M44 58C52.5 54.5 56.5 46.5 54.5 38.5C53.2 33.2 49.2 30 46.5 26C45.6 31.5 43.2 35.5 40.5 37C42.5 43 42.2 51 38.5 57Z";
const coreShape =
  "M33 43C34 48 38 49 37 53C36 56 34 58 31 58C27 58 25 55 26 52C27 49 30 48 33 43Z";
const hotCoreShape =
  "M33.5 48C34.5 51.5 37 52.5 36 55.5C35.2 57.8 33.4 59 31.2 59C28.4 59 26.5 57 27.4 54.5C28.2 52.3 31 51.5 33.5 48Z";
const coalBase =
  "M15 58.4C20.5 55.8 26.4 54.9 32 55.1C37.6 54.9 43.5 55.8 49 58.4C44 61.7 37.8 63 32 62.8C26.2 63 20 61.7 15 58.4Z";
const coalCrack =
  "M26 59.2C28.5 57.9 30.6 57.6 32.2 58.4C33.6 59.1 35.6 59 38 57.9";

// Flame gradients rest on CSS variables so each tier can shift the whole fire
// from campfire orange to violet inferno without new markup.
const gradientStops: Record<
  "outer" | "inner",
  { offset: string; varName: string }[]
> = {
  outer: [
    { offset: "0%", varName: "--ember-outer-0" },
    { offset: "45%", varName: "--ember-outer-1" },
    { offset: "78%", varName: "--ember-outer-2" },
    { offset: "100%", varName: "--ember-outer-3" },
  ],
  inner: [
    { offset: "0%", varName: "--ember-inner-0" },
    { offset: "55%", varName: "--ember-inner-1" },
    { offset: "100%", varName: "--ember-inner-2" },
  ],
};

function Spark({
  x,
  y,
  r,
  delay,
  duration,
  drift,
  className,
}: {
  x: number;
  y: number;
  r: number;
  delay: number;
  duration: number;
  drift: number;
  className: string;
}) {
  return (
    <circle
      className={className}
      cx={x}
      cy={y}
      r={r}
      style={
        {
          "--drift": `${drift}px`,
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`,
        } as CSSProperties
      }
    />
  );
}

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
  const gradientId = useId();
  const value = tier ?? streakTier(count);
  const tongues = value === "blaze" || value === "inferno";
  const sparks = value !== "spark";
  return (
    <span
      aria-hidden="true"
      className={cn("streak-ember", className)}
      data-tier={value}
      data-dim={dim || undefined}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          {(["outer", "inner"] as const).map((name) => (
            <linearGradient
              key={name}
              id={`${gradientId}-${name}`}
              x1="0"
              y1="1"
              x2="0.35"
              y2="0"
            >
              {gradientStops[name].map((stop) => (
                <stop
                  key={stop.offset}
                  offset={stop.offset}
                  style={{ stopColor: `var(${stop.varName})` }}
                />
              ))}
            </linearGradient>
          ))}
        </defs>
        <g className="flame-body">
          {tongues && <path className="ember-coal-base" d={coalBase} />}
          {tongues && (
            <>
              <g
                className="flame-side"
                style={{ transformOrigin: "20px 58px" }}
              >
                <path fill={`url(#${gradientId}-outer)`} d={leftTongue} />
              </g>
              <g
                className="flame-side"
                style={{
                  transformOrigin: "44px 58px",
                  animationDelay: "-0.7s",
                }}
              >
                <path fill={`url(#${gradientId}-outer)`} d={rightTongue} />
              </g>
            </>
          )}
          <g className="flame-flicker">
            <path
              className="flame-outer"
              fill={`url(#${gradientId}-outer)`}
              d={outerFlame}
            />
          </g>
          <g className="flame-flicker-inner">
            <path
              className="flame-inner"
              fill={`url(#${gradientId}-inner)`}
              d={innerFlame}
            />
            <path className="flame-core" d={coreShape} />
            {value === "inferno" && (
              <path className="flame-hot-core" d={hotCoreShape} />
            )}
            {tongues && <path className="ember-coal-crack" d={coalCrack} />}
          </g>
        </g>
        {sparks && (
          <g className="ember-sparks">
            {value === "flame" && (
              <>
                <Spark
                  className="ember-spark"
                  x={30}
                  y={26}
                  r={1.1}
                  delay={0}
                  duration={3.2}
                  drift={-3}
                />
                <Spark
                  className="ember-spark"
                  x={36}
                  y={22}
                  r={0.9}
                  delay={1.7}
                  duration={3.6}
                  drift={3}
                />
              </>
            )}
            {value === "blaze" && (
              <>
                <Spark
                  className="ember-spark"
                  x={22}
                  y={30}
                  r={1.5}
                  delay={0}
                  duration={2.4}
                  drift={-6}
                />
                <Spark
                  className="ember-spark"
                  x={42}
                  y={28}
                  r={1.3}
                  delay={0.7}
                  duration={2.8}
                  drift={5}
                />
                <Spark
                  className="ember-spark"
                  x={32}
                  y={18}
                  r={1.2}
                  delay={1.4}
                  duration={2.2}
                  drift={-2}
                />
                <Spark
                  className="ember-spark"
                  x={26}
                  y={14}
                  r={0.9}
                  delay={2}
                  duration={3}
                  drift={4}
                />
              </>
            )}
            {value === "inferno" && (
              <>
                <g className="ember-orbit">
                  <circle className="ember-orbit-dot" cx="52" cy="34" r="1.6" />
                  <circle
                    className="ember-orbit-dot"
                    cx="12"
                    cy="34"
                    r="1.3"
                    style={{ animationDelay: "-1.1s" }}
                  />
                </g>
                <Spark
                  className="ember-spark"
                  x={18}
                  y={32}
                  r={1.8}
                  delay={0}
                  duration={1.8}
                  drift={-8}
                />
                <Spark
                  className="ember-spark"
                  x={46}
                  y={30}
                  r={1.5}
                  delay={0.4}
                  duration={2.1}
                  drift={7}
                />
                <Spark
                  className="ember-spark"
                  x={32}
                  y={20}
                  r={1.4}
                  delay={0.9}
                  duration={1.6}
                  drift={-3}
                />
                <Spark
                  className="ember-spark"
                  x={24}
                  y={12}
                  r={1.1}
                  delay={1.3}
                  duration={2.4}
                  drift={5}
                />
                <Spark
                  className="ember-spark"
                  x={40}
                  y={10}
                  r={1}
                  delay={1.7}
                  duration={2}
                  drift={-5}
                />
                <Spark
                  className="ember-spark"
                  x={32}
                  y={6}
                  r={0.9}
                  delay={2.2}
                  duration={2.6}
                  drift={2}
                />
              </>
            )}
          </g>
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
  pending: "In progress",
  off: "Off day",
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
  const counts = { done: 0, slipped: 0, missed: 0, off: 0 };
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
        aria-label={`Last ${weeks} weeks: ${counts.done} days ${doneLabel}, ${counts.slipped} slipped, ${counts.missed} missed, ${counts.off} off.`}
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
            ["pending", "In progress"],
            ["off", "Off day"],
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
