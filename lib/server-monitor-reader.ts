import {
  MONITOR_HISTORY_MS,
  MONITOR_INTERVAL_MS,
  MONITOR_STALE_MS,
  type MonitorResponse,
  type MonitorSnapshot,
  usagePercent,
} from "./server-monitor";
import { deriveSample, type HostReading } from "./server-monitor-collector";

export function createMonitorReader({
  collect,
  now = Date.now,
}: {
  collect: (() => Promise<HostReading>) | null;
  now?: () => number;
}) {
  let previous: HostReading | null = null;
  let snapshot: MonitorSnapshot | null = null;
  let pending: Promise<MonitorResponse> | null = null;
  let expires = 0;
  let connected = false;
  function result(): MonitorResponse {
    const recent =
      snapshot && now() - snapshot.sample.at <= MONITOR_STALE_MS
        ? snapshot
        : null;
    return {
      connection:
        connected && recent ? "connected" : recent ? "reconnecting" : "offline",
      snapshot: recent,
    };
  }
  async function refresh(): Promise<MonitorResponse> {
    try {
      if (!collect) return { connection: "unconfigured", snapshot: null };
      const current = await collect();
      const at = now();
      const sample = deriveSample(current, previous, at);
      const history =
        snapshot && current.uptime >= snapshot.sample.uptime
          ? snapshot.history.filter(
              (point) => point.at >= at - MONITOR_HISTORY_MS,
            )
          : [];
      history.push({
        at,
        cpu: sample.cpu.percent,
        memory: usagePercent(sample.memory),
        disk: usagePercent(sample.disk),
        read: sample.io?.read ?? null,
        write: sample.io?.write ?? null,
        received: sample.network?.received ?? null,
        sent: sample.network?.sent ?? null,
      });
      snapshot = { sample, history: history.slice(-61) };
      previous = current;
      connected = true;
    } catch {
      connected = false;
      previous = null;
    }
    expires = now() + MONITOR_INTERVAL_MS;
    return result();
  }
  return function read(): Promise<MonitorResponse> {
    if (!collect)
      return Promise.resolve({ connection: "unconfigured", snapshot: null });
    if (pending) return pending;
    if (now() < expires) return Promise.resolve(result());
    pending = refresh().finally(() => {
      pending = null;
    });
    return pending;
  };
}
