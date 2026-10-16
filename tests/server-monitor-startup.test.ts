import { expect, mock, test } from "bun:test";

let readers = 0;
let starts = 0;
let reads = 0;
let realtimeStarts = 0;
const response = { connection: "unconfigured", snapshot: null } as const;
mock.module("server-only", () => ({}));
mock.module("@/lib/server-monitor-reader", () => ({
  createMonitorReader: () => {
    readers++;
    return {
      start: () => starts++,
      stop: () => {},
      read: async () => {
        reads++;
        return response;
      },
    };
  },
}));
mock.module("@/lib/realtime-websocket-server", () => ({
  startRealtimeWebSocketServer: async () => {
    realtimeStarts++;
  },
}));

const { register } = await import("../instrumentation");
const { readServerMonitor } = await import("../lib/server-monitor-server");

test("Node startup starts collection before any monitor request and the route shares that reader", async () => {
  const runtime = process.env.NEXT_RUNTIME;
  try {
    process.env.NEXT_RUNTIME = "edge";
    await register();
    expect(readers).toBe(0);
    expect(starts).toBe(0);
    process.env.NEXT_RUNTIME = "nodejs";
    await register();
    expect(readers).toBe(1);
    expect(starts).toBe(1);
    expect(reads).toBe(0);
    expect(realtimeStarts).toBe(1);
    expect(await readServerMonitor()).toEqual(response);
    expect(readers).toBe(1);
    expect(reads).toBe(1);
    await register();
    expect(readers).toBe(1);
  } finally {
    if (runtime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = runtime;
  }
});
