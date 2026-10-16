import { z } from "zod";

export const MONITOR_INTERVAL_MS = 5_000;
export const MONITOR_STALE_MS = 20_000;
export const MONITOR_HISTORY_MS = 5 * 60_000;
const amount = z.number().finite().nonnegative();
const percent = amount.max(100);
const capacity = z
  .object({ used: amount, total: amount.positive() })
  .refine((value) => value.used <= value.total);

export const monitorSampleSchema = z.object({
  at: amount,
  uptime: amount,
  cpu: z.object({
    model: z.string().max(120),
    percent: percent.nullable(),
    cores: z
      .array(
        z.object({
          id: z.string().regex(/^cpu\d+$/),
          percent: percent.nullable(),
        }),
      )
      .min(1)
      .max(1024),
    load: z.tuple([amount, amount, amount]),
    temperature: z.number().min(-20).max(150).nullable(),
    frequency: amount.nullable(),
  }),
  memory: capacity,
  swap: z
    .object({ used: amount, total: amount })
    .refine((value) => value.used <= value.total),
  disk: capacity,
  io: z.object({ read: amount, write: amount }).nullable(),
  network: z.object({ received: amount, sent: amount }).nullable(),
});

export const monitorPointSchema = z.object({
  at: amount,
  cpu: percent.nullable(),
  memory: percent,
  disk: percent,
  read: amount.nullable(),
  write: amount.nullable(),
  received: amount.nullable(),
  sent: amount.nullable(),
});
export const monitorSnapshotSchema = z.object({
  sample: monitorSampleSchema,
  history: z.array(monitorPointSchema).max(61),
});
export const monitorResponseSchema = z.object({
  connection: z.enum(["connected", "reconnecting", "offline", "unconfigured"]),
  snapshot: monitorSnapshotSchema.nullable(),
});
export type MonitorSample = z.infer<typeof monitorSampleSchema>;
export type MonitorPoint = z.infer<typeof monitorPointSchema>;
export type MonitorSnapshot = z.infer<typeof monitorSnapshotSchema>;
export type MonitorResponse = z.infer<typeof monitorResponseSchema>;

export function usagePercent(value: { used: number; total: number }) {
  return value.total ? (100 * value.used) / value.total : 0;
}

export function formatBytes(value: number | null, rate = false) {
  if (value === null) return "Unavailable";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let unit = 0;
  let scaled = value;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit++;
  }
  return `${scaled.toLocaleString("en-US", { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}${rate ? "/s" : ""}`;
}

export function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days
    ? `${days}d ${hours}h`
    : hours
      ? `${hours}h ${minutes}m`
      : `${minutes}m`;
}

// Each segment stops at a missing sample or a collection gap. Never draw a
// bridge over time when the host could not be reached.
export function chartSegments(
  history: MonitorPoint[],
  key: Exclude<keyof MonitorPoint, "at">,
  end: number,
  ceiling: number,
) {
  const segments: { x: number; y: number }[][] = [];
  let previous = 0;
  for (const point of history) {
    const value = point[key];
    if (point.at < end - MONITOR_HISTORY_MS || point.at > end) continue;
    if (value === null) {
      previous = 0;
      continue;
    }
    if (!previous || point.at - previous > MONITOR_INTERVAL_MS * 3)
      segments.push([]);
    segments.at(-1)?.push({
      x: ((point.at - (end - MONITOR_HISTORY_MS)) / MONITOR_HISTORY_MS) * 600,
      y: 100 - (Math.min(value, ceiling) / Math.max(1, ceiling)) * 96,
    });
    previous = point.at;
  }
  return segments;
}
