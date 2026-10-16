import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  chartSegments,
  formatBytes,
  MONITOR_HISTORY_MS,
  MONITOR_STALE_MS,
  monitorResponseSchema,
} from "../lib/server-monitor";
import {
  deriveSample,
  type HostReading,
  parseCpu,
  parseDiskIo,
  parseMemory,
  readHostMetrics,
} from "../lib/server-monitor-collector";
import { createMonitorReader } from "../lib/server-monitor-reader";

function reading(tick = 0): HostReading {
  return {
    uptime: 100 + tick * 5,
    cpu: parseCpu(
      `cpu ${100 + tick * 25} 0 0 ${100 + tick * 75} 0 0 0 0 99 99\ncpu0 ${100 + tick * 25} 0 0 ${100 + tick * 75} 0 0 0 0`,
    ),
    model: "CPU",
    frequency: 2300,
    temperature: 53,
    load: [0.5, 1, 1.5],
    memory: { used: 2048, total: 8192 },
    swap: { used: 0, total: 0 },
    disk: { used: 4096, total: 16384 },
    io: { sda: { first: 1000 + tick * 500, second: 2000 + tick * 1000 } },
    network: {
      eth0: { first: 1000 + tick * 2500, second: 2000 + tick * 5000 },
    },
  };
}

test("CPU excludes double-counted guest fields, uses counter deltas, and treats first/invalid samples as unknown", () => {
  expect(reading().cpu[0].total).toBe(200);
  const first = deriveSample(reading(), null, 1000);
  expect(first.cpu.percent).toBeNull();
  expect(first.network).toBeNull();
  const next = deriveSample(reading(1), reading(), 6000);
  expect(next.cpu.percent).toBe(25);
  expect(next.cpu.cores[0].percent).toBe(25);
  expect(next.io).toEqual({ read: 100, write: 200 });
  expect(next.network).toEqual({ received: 500, sent: 1000 });
  expect(deriveSample(reading(10), reading(), 51000).cpu.percent).toBeNull();
  expect(deriveSample(reading(), reading(1), 6000).network).toBeNull();
  const reset = reading(1);
  reset.network = { eth0: { first: 0, second: 0 } };
  expect(deriveSample(reset, reading(), 6000).network).toBeNull();
  reset.network = { eth1: { first: 10000, second: 10000 } };
  expect(deriveSample(reset, reading(), 6000).network).toBeNull();
  reset.cpu = parseCpu("cpu 10 0 0 90\ncpu0 10 0 0 90");
  expect(deriveSample(reset, reading(), 6000).cpu.percent).toBeNull();
});

test("memory uses available RAM and disk I/O counts selected whole devices only", () => {
  expect(
    parseMemory(
      "MemTotal: 1000 kB\nMemFree: 200 kB\nMemAvailable: 400 kB\nSwapTotal: 100 kB\nSwapFree: 75 kB\nCached: 200 kB\n",
    ),
  ).toEqual({
    memory: { total: 1024000, used: 614400 },
    swap: { total: 102400, used: 25600 },
  });
  expect(() => parseMemory("MemTotal: 1000 kB")).toThrow();
  expect(
    parseDiskIo(
      "8 0 sda 1 0 10 0 1 0 20 0 0 0 0\n8 1 sda1 1 0 10 0 1 0 20 0 0 0 0",
      ["sda"],
    ),
  ).toEqual({ sda: { first: 5120, second: 10240 } });
  expect(parseDiskIo("", [])).toBeNull();
});

test("viewers share one collection, failures are cached, stale samples expire, recovery and reboot reset baselines", async () => {
  let time = 100_000;
  let collections = 0;
  let fail = false;
  let restart = false;
  const read = createMonitorReader({
    now: () => time,
    collect: async () => {
      collections++;
      if (fail) throw new Error("private path/host info");
      return reading(restart ? 0 : collections);
    },
  });
  const results = await Promise.all(Array.from({ length: 20 }, () => read()));
  expect(collections).toBe(1);
  expect(results[0].snapshot?.sample.cpu.percent).toBeNull();
  await read();
  expect(collections).toBe(1);
  time += 5000;
  expect((await read()).snapshot?.sample.cpu.percent).toBe(25);
  fail = true;
  time += 5000;
  const stale = await read();
  expect(stale.connection).toBe("reconnecting");
  expect(stale.snapshot?.sample.at).toBe(105000);
  await read();
  expect(collections).toBe(3);
  expect(JSON.stringify(stale)).not.toContain("private path");
  time += MONITOR_STALE_MS + 1;
  expect(await read()).toEqual({ connection: "offline", snapshot: null });
  fail = false;
  time += 5000;
  const recovered = await read();
  expect(recovered.snapshot?.sample.cpu.percent).toBeNull();
  expect(recovered.snapshot?.history.length).toBeGreaterThan(1);
  restart = true;
  time += 5000;
  const rebooted = await read();
  expect(rebooted.snapshot?.history).toHaveLength(1);
  expect(rebooted.snapshot?.sample.cpu.percent).toBeNull();
  expect(await createMonitorReader({ collect: null })()).toEqual({
    connection: "unconfigured",
    snapshot: null,
  });
});

test("history stays bounded and schema strips unapproved metadata", async () => {
  let tick = 0;
  const read = createMonitorReader({
    now: () => 100_000 + tick * 5000,
    collect: async () => reading(tick),
  });
  let result = await read();
  for (tick = 1; tick < 100; tick++) result = await read();
  expect(result.snapshot?.history).toHaveLength(61);
  const parsed = monitorResponseSchema.parse({
    ...result,
    token: "secret",
    snapshot: {
      ...result.snapshot,
      hostname: "private",
      sample: { ...result.snapshot?.sample, processes: ["secret"] },
    },
  });
  expect(JSON.stringify(parsed)).not.toContain("secret");
  expect(JSON.stringify(parsed)).not.toContain("private");
  expect(
    monitorResponseSchema.safeParse({
      ...result,
      snapshot: {
        ...result.snapshot,
        sample: { ...result.snapshot?.sample, memory: { used: 10, total: 5 } },
      },
    }).success,
  ).toBe(false);
});

test("chart gaps and unavailable rates stay unknown", () => {
  const point = (at: number, cpu: number | null) => ({
    at,
    cpu,
    memory: 25,
    disk: 50,
    read: null,
    write: null,
    received: null,
    sent: null,
  });
  const end = MONITOR_HISTORY_MS + 1000;
  expect(
    chartSegments(
      [
        point(end - 25000, 25),
        point(end - 20000, null),
        point(end - 15000, 50),
        point(end, 75),
      ],
      "cpu",
      end,
      100,
    ).map((segment) => segment.length),
  ).toEqual([1, 2]);
  expect(
    chartSegments([point(end - 25000, 25), point(end, 75)], "cpu", end, 100),
  ).toHaveLength(2);
  expect(formatBytes(null, true)).toBe("Unavailable");
  expect(formatBytes(0, true)).toBe("0 B/s");
  expect(formatBytes(1024, true)).toBe("1 KiB/s");
});

test("collector reads the configured host tree and tolerates absent optional sensors", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-monitor-"));
  const put = async (path: string, value: string) =>
    writeFile(join(root, path), value);
  try {
    for (const directory of [
      "proc",
      "disk",
      "sys/class/net/eth0/device",
      "sys/class/net/eth0/statistics",
      "sys/class/net/docker0/statistics",
      "sys/block/sda/device",
      "sys/block/loop0",
      "sys/class/hwmon/hwmon0",
    ])
      await mkdir(join(root, directory), { recursive: true });
    await Promise.all([
      put("proc/stat", "cpu 100 0 0 100\ncpu0 100 0 0 100"),
      put(
        "proc/meminfo",
        "MemTotal: 1000 kB\nMemAvailable: 400 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n",
      ),
      put("proc/uptime", "100.5 200"),
      put("proc/loadavg", "0.25 0.50 0.75 1/100 1337"),
      put("proc/cpuinfo", "model name : Test CPU\ncpu MHz : 2000"),
      put("proc/diskstats", "8 0 sda 1 0 10 0 1 0 20 0 0 0 0"),
      put("sys/class/net/eth0/statistics/rx_bytes", "1024"),
      put("sys/class/net/eth0/statistics/tx_bytes", "2048"),
      put("sys/class/net/docker0/statistics/rx_bytes", "999999"),
      put("sys/class/net/docker0/statistics/tx_bytes", "999999"),
      put("sys/class/hwmon/hwmon0/name", "coretemp\n"),
      put("sys/class/hwmon/hwmon0/temp1_input", "51000"),
    ]);
    const collected = await readHostMetrics(root);
    expect(collected.network).toEqual({ eth0: { first: 1024, second: 2048 } });
    expect(collected.temperature).toBe(51);
    expect(collected.frequency).toBe(2000);
    expect(collected.io?.sda.first).toBe(5120);
    expect(deriveSample(collected, null, 1000).cpu.model).toBe("Test CPU");
    await rm(join(root, "sys"), { recursive: true });
    const missing = await readHostMetrics(root);
    expect(missing.temperature).toBeNull();
    expect(missing.network).toBeNull();
    expect(missing.io).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
