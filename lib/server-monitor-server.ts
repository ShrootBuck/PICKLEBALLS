import "server-only";
import { readHostMetrics } from "./server-monitor-collector";
import { createMonitorReader } from "./server-monitor-reader";

// Instrumentation and route handlers can load separate module instances. Keep
// their collector and rolling history shared across the entire web process.
const globals = globalThis as typeof globalThis & {
  pickleBallsServerMonitor?: ReturnType<typeof createMonitorReader>;
};

function getServerMonitor() {
  const root = process.env.SERVER_MONITOR_HOST_PATH;
  globals.pickleBallsServerMonitor ??= createMonitorReader({
    collect:
      root && process.platform === "linux" ? () => readHostMetrics(root) : null,
  });
  return globals.pickleBallsServerMonitor;
}

export function startServerMonitor() {
  getServerMonitor().start();
}

export function readServerMonitor() {
  return getServerMonitor().read();
}
