"use client";

import {
  Activity,
  ArrowDown,
  ArrowUp,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Server,
  Thermometer,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  chartSegments,
  formatBytes,
  formatUptime,
  MONITOR_INTERVAL_MS,
  MONITOR_STALE_MS,
  type MonitorPoint,
  type MonitorResponse,
  type MonitorSnapshot,
  monitorResponseSchema,
  usagePercent,
} from "@/lib/server-monitor";

function useServerMonitor(open: boolean) {
  const [data, setData] = useState<MonitorResponse | null>(null);
  const [now, setNow] = useState(0);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let signedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const tick = () => setNow(Date.now());
    const clock = setInterval(tick, 1_000);
    function lostSignal() {
      setData((previous) => {
        const snapshot = previous?.snapshot;
        const recent =
          snapshot && Date.now() - snapshot.sample.at <= MONITOR_STALE_MS
            ? snapshot
            : null;
        return {
          connection: recent ? "reconnecting" : "offline",
          snapshot: recent,
        };
      });
    }
    async function poll() {
      if (stopped || signedOut || document.hidden || !navigator.onLine) return;
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch("/api/server-monitor", {
          cache: "no-store",
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]),
        });
        if (response.status === 401 || response.status === 403) {
          signedOut = true;
          if (!stopped && !request.signal.aborted) {
            setNeedsSignIn(true);
            setData({ connection: "offline", snapshot: null });
          }
          return;
        }
        if (!response.ok) throw new Error("Monitor unavailable");
        const next = monitorResponseSchema.parse(await response.json());
        if (!stopped && !request.signal.aborted) {
          setNeedsSignIn(false);
          setData(next);
          tick();
        }
      } catch {
        if (!stopped && !request.signal.aborted) lostSignal();
      } finally {
        if (!stopped && !request.signal.aborted && !signedOut)
          timer = setTimeout(poll, MONITOR_INTERVAL_MS);
      }
    }
    function resume() {
      clearTimeout(timer);
      controller?.abort();
      tick();
      if (!navigator.onLine) lostSignal();
      void poll();
    }
    resume();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(clock);
      controller?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, [open]);
  const snapshot =
    data?.snapshot && now - data.snapshot.sample.at <= MONITOR_STALE_MS
      ? data.snapshot
      : null;
  return { data, snapshot, now, needsSignIn };
}

type Series = {
  key: Exclude<keyof MonitorPoint, "at">;
  label: string;
  secondary?: boolean;
};
function MetricChart({
  snapshot,
  series,
  percent = false,
}: {
  snapshot: MonitorSnapshot;
  series: Series[];
  percent?: boolean;
}) {
  const id = useId();
  const highest = Math.max(
    1,
    ...snapshot.history.flatMap((point) =>
      series.map(({ key }) => point[key] ?? 0),
    ),
  );
  const ceiling = percent ? 100 : highest * 1.15;
  const populated = snapshot.history.filter((point) =>
    series.some(({ key }) => point[key] !== null),
  ).length;
  return (
    <div className="monitor-chart">
      <div className="monitor-chart-scale" aria-hidden="true">
        {percent ? "100%" : formatBytes(ceiling, true)}
      </div>
      <svg
        viewBox="0 0 600 112"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${series.map((item) => item.label).join(" and ")} over the last five minutes${populated < 2 ? ", collecting history" : ""}`}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--metric-color)"
              stopOpacity="0.22"
            />
            <stop
              offset="100%"
              stopColor="var(--metric-color)"
              stopOpacity="0.015"
            />
          </linearGradient>
        </defs>
        {[4, 52, 100].map((y) => (
          <line
            key={y}
            x1="0"
            x2="600"
            y1={y}
            y2={y}
            className="monitor-gridline"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {series.map(({ key, secondary }) =>
          chartSegments(snapshot.history, key, snapshot.sample.at, ceiling).map(
            (segment) => {
              const first = segment[0],
                last = segment[segment.length - 1];
              const path = segment
                .map(
                  (point, index) =>
                    `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`,
                )
                .join(" ");
              return (
                <g key={`${key}-${first.x}`}>
                  {!secondary && segment.length > 1 && (
                    <path
                      d={`${path} L${last.x},112 L${first.x},112 Z`}
                      fill={`url(#${id})`}
                    />
                  )}
                  <path
                    d={path}
                    fill="none"
                    stroke={
                      secondary
                        ? "var(--metric-secondary)"
                        : "var(--metric-color)"
                    }
                    strokeWidth="2"
                    strokeDasharray={secondary ? "4 4" : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={last.x}
                    cy={last.y}
                    r="2.5"
                    fill={
                      secondary
                        ? "var(--metric-secondary)"
                        : "var(--metric-color)"
                    }
                  />
                </g>
              );
            },
          ),
        )}
      </svg>
      {populated < 2 && (
        <span className="monitor-chart-wait">Collecting history</span>
      )}
      <div className="monitor-chart-axis" aria-hidden="true">
        <span>5 min ago</span>
        <span>Latest</span>
      </div>
    </div>
  );
}

function Meter({ value, label }: { value: number | null; label: string }) {
  if (value === null)
    return <div className="monitor-meter" aria-hidden="true" />;
  return (
    <div className="monitor-meter">
      <meter
        className="sr-only"
        aria-label={label}
        min={0}
        max={100}
        value={value}
      />
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

function MonitorMetrics({ snapshot }: { snapshot: MonitorSnapshot }) {
  const { sample } = snapshot;
  return (
    <div className="monitor-panels">
      <Card className="monitor-panel" data-metric="cpu" size="sm">
        <CardHeader>
          <CardTitle>
            <span className="monitor-label">
              <Cpu aria-hidden="true" />
              CPU
            </span>
          </CardTitle>
          <div className="monitor-reading">
            <strong>
              {sample.cpu.percent === null
                ? "Measuring"
                : sample.cpu.percent.toFixed(0)}
              {sample.cpu.percent !== null && <small>%</small>}
            </strong>
            <span>{sample.cpu.cores.length} logical cores</span>
          </div>
        </CardHeader>
        <CardContent>
          <MetricChart
            snapshot={snapshot}
            percent
            series={[{ key: "cpu", label: "CPU usage" }]}
          />
          <section className="monitor-cores" aria-label="CPU cores">
            {sample.cpu.cores.map((core) => (
              <div key={core.id}>
                <span>Core {Number(core.id.slice(3)) + 1}</span>
                <Meter label={`${core.id} usage`} value={core.percent} />
                <span>
                  {core.percent === null
                    ? "..."
                    : `${Math.round(core.percent)}%`}
                </span>
              </div>
            ))}
          </section>
          <div className="monitor-detail">
            <span>
              Load average{" "}
              <span className="sr-only">over 1, 5, and 15 minutes</span>
            </span>
            <span>
              {sample.cpu.load.map((load) => load.toFixed(2)).join(" / ")}
            </span>
          </div>
        </CardContent>
      </Card>
      <Card className="monitor-panel" data-metric="memory" size="sm">
        <CardHeader>
          <CardTitle>
            <span className="monitor-label">
              <MemoryStick aria-hidden="true" />
              Memory
            </span>
          </CardTitle>
          <div className="monitor-reading">
            <strong>
              {usagePercent(sample.memory).toFixed(0)}
              <small>%</small>
            </strong>
            <span>{formatBytes(sample.memory.used)} used</span>
          </div>
        </CardHeader>
        <CardContent>
          <MetricChart
            snapshot={snapshot}
            percent
            series={[{ key: "memory", label: "Memory usage" }]}
          />
          <div className="monitor-detail">
            <span>RAM</span>
            <span>
              {formatBytes(sample.memory.used)} /{" "}
              {formatBytes(sample.memory.total)}
            </span>
          </div>
          <Meter label="Memory usage" value={usagePercent(sample.memory)} />
          <div className="monitor-detail">
            <span>Swap</span>
            <span>
              {sample.swap.total
                ? `${formatBytes(sample.swap.used)} / ${formatBytes(sample.swap.total)}`
                : "Not enabled"}
            </span>
          </div>
          <Meter label="Swap usage" value={usagePercent(sample.swap)} />
          <div className="monitor-detail">
            <span>Available RAM</span>
            <span>{formatBytes(sample.memory.total - sample.memory.used)}</span>
          </div>
        </CardContent>
      </Card>
      <Card className="monitor-panel" data-metric="disk" size="sm">
        <CardHeader>
          <CardTitle>
            <span className="monitor-label">
              <HardDrive aria-hidden="true" />
              Disk
            </span>
          </CardTitle>
          <div className="monitor-reading">
            <strong>
              {usagePercent(sample.disk).toFixed(0)}
              <small>%</small>
            </strong>
            <span>
              {formatBytes(sample.disk.total - sample.disk.used)} free
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <MetricChart
            snapshot={snapshot}
            series={[
              { key: "read", label: "Disk read speed" },
              { key: "write", label: "Disk write speed", secondary: true },
            ]}
          />
          <div className="monitor-rates">
            <div>
              <span>
                <i />
                Read
              </span>
              <strong>{formatBytes(sample.io?.read ?? null, true)}</strong>
            </div>
            <div>
              <span>
                <i data-secondary="" />
                Write
              </span>
              <strong>{formatBytes(sample.io?.write ?? null, true)}</strong>
            </div>
          </div>
          <div className="monitor-detail">
            <span>Storage</span>
            <span>
              {formatBytes(sample.disk.used)} / {formatBytes(sample.disk.total)}
            </span>
          </div>
          <Meter label="Disk space used" value={usagePercent(sample.disk)} />
          <p className="monitor-footnote">Activity across physical disks</p>
        </CardContent>
      </Card>
      <Card className="monitor-panel" data-metric="network" size="sm">
        <CardHeader>
          <CardTitle>
            <span className="monitor-label">
              <Network aria-hidden="true" />
              Network
            </span>
          </CardTitle>
          <div className="monitor-reading">
            <strong className="monitor-rate-reading">
              {formatBytes(
                sample.network
                  ? sample.network.received + sample.network.sent
                  : null,
                true,
              )}
            </strong>
            <span>combined traffic</span>
          </div>
        </CardHeader>
        <CardContent>
          <MetricChart
            snapshot={snapshot}
            series={[
              { key: "received", label: "Download speed" },
              { key: "sent", label: "Upload speed", secondary: true },
            ]}
          />
          <div className="monitor-rates">
            <div>
              <span>
                <ArrowDown aria-hidden="true" />
                Download
              </span>
              <strong>
                {formatBytes(sample.network?.received ?? null, true)}
              </strong>
            </div>
            <div>
              <span>
                <ArrowUp aria-hidden="true" />
                Upload
              </span>
              <strong>{formatBytes(sample.network?.sent ?? null, true)}</strong>
            </div>
          </div>
          <p className="monitor-footnote">
            Traffic across physical network interfaces
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function ServerMonitor() {
  const [open, setOpen] = useState(false);
  const { data, snapshot, now, needsSignIn } = useServerMonitor(open);
  const connected = data?.connection === "connected" && Boolean(snapshot);
  const age = snapshot
    ? Math.max(0, Math.floor((now - snapshot.sample.at) / 1000))
    : null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            className="w-full justify-start"
            aria-label="Open Server Monitor"
            title="Server Monitor"
          />
        }
      >
        <Activity data-icon="inline-start" />
        <span>Server Monitor</span>
      </DialogTrigger>
      <DialogContent className="gap-3 sm:max-w-4xl" data-server-monitor="">
        <DialogHeader>
          <DialogTitle>Server Monitor</DialogTitle>
          <DialogDescription className="sr-only">
            Live stats from the Pickle Balls server.
          </DialogDescription>
        </DialogHeader>
        <div className="monitor-status-row">
          <div className="monitor-host">
            <span className="monitor-host-icon">
              <Server aria-hidden="true" />
            </span>
            <div>
              <p>Pickle Balls</p>
              <span>
                {snapshot ? snapshot.sample.cpu.model : "Home server"}
              </span>
            </div>
          </div>
          <div aria-live="polite">
            <Badge variant={connected ? "success" : "secondary"}>
              <span className="monitor-dot" />
              {connected
                ? "Live"
                : !data
                  ? "Connecting"
                  : data.connection === "unconfigured"
                    ? "Not connected"
                    : snapshot
                      ? "Reconnecting"
                      : "Offline"}
            </Badge>
          </div>
        </div>
        {snapshot ? (
          <>
            <div className="monitor-vitals">
              <span>
                <Activity aria-hidden="true" />
                Up {formatUptime(snapshot.sample.uptime)}
              </span>
              <span>
                <Thermometer aria-hidden="true" />
                {snapshot.sample.cpu.temperature === null
                  ? "Temperature unavailable"
                  : `${snapshot.sample.cpu.temperature.toFixed(0)}°C`}
              </span>
              {snapshot.sample.cpu.frequency !== null && (
                <span>
                  <Cpu aria-hidden="true" />
                  {(snapshot.sample.cpu.frequency / 1000).toFixed(2)} GHz
                </span>
              )}
            </div>
            <MonitorMetrics snapshot={snapshot} />
            <div className="monitor-footer">
              <span>
                {connected
                  ? "Updates every 5 seconds"
                  : "Showing last known readings"}
              </span>
              <span>
                {age === 0 ? "Sampled just now" : `Sampled ${age}s ago`}
              </span>
            </div>
          </>
        ) : !data ? (
          <section
            className="monitor-panels"
            aria-label="Loading server metrics"
          >
            {["cpu", "memory", "disk", "network"].map((key) => (
              <Skeleton key={key} className="h-64 rounded-xl" />
            ))}
          </section>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Activity />
              </EmptyMedia>
              <EmptyTitle>
                {needsSignIn
                  ? "Sign in to view the server."
                  : data.connection === "unconfigured"
                    ? "The monitor isn't connected yet."
                    : "Waiting for the server."}
              </EmptyTitle>
              <EmptyDescription>
                {needsSignIn
                  ? "Sign in again, then reopen the monitor for live readings."
                  : data.connection === "unconfigured"
                    ? "Live readings will appear when the server is connected."
                    : "Fresh readings are temporarily unavailable. We'll reconnect automatically."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </DialogContent>
    </Dialog>
  );
}
