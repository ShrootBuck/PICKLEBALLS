import "server-only";
import { readHostMetrics } from "./server-monitor-collector";
import { createMonitorReader } from "./server-monitor-reader";

const root = process.env.SERVER_MONITOR_HOST_PATH;
export const readServerMonitor = createMonitorReader({
  collect:
    root && process.platform === "linux" ? () => readHostMetrics(root) : null,
});
