import { access, readdir, readFile, statfs } from "node:fs/promises";
import { join } from "node:path";
import { type MonitorSample, monitorSampleSchema } from "./server-monitor";

export type CpuCounter = { id: string; total: number; idle: number };
type Counters = Record<string, { first: number; second: number }>;
export type HostReading = {
  uptime: number;
  cpu: CpuCounter[];
  model: string;
  frequency: number | null;
  temperature: number | null;
  load: [number, number, number];
  memory: { used: number; total: number };
  swap: { used: number; total: number };
  disk: { used: number; total: number };
  io: Counters | null;
  network: Counters | null;
};

export function parseCpu(text: string): CpuCounter[] {
  return text
    .split("\n")
    .filter((line) => /^cpu(?:\d+)?\s/.test(line))
    .map((line) => {
      const [id, ...fields] = line.trim().split(/\s+/);
      // guest/guest_nice are already included in user/nice. Count only 0..7.
      const times = fields.slice(0, 8).map(Number);
      if (
        times.length < 4 ||
        times.some((time) => !Number.isFinite(time) || time < 0)
      )
        throw new Error("Invalid CPU counters");
      return {
        id,
        total: times.reduce((sum, time) => sum + time, 0),
        idle: times[3] + (times[4] ?? 0),
      };
    });
}

export function parseMemory(text: string) {
  const fields = Object.fromEntries(
    [...text.matchAll(/^(\w+):\s+(\d+) kB$/gm)].map((match) => [
      match[1],
      Number(match[2]) * 1024,
    ]),
  );
  for (const field of ["MemTotal", "MemAvailable", "SwapTotal", "SwapFree"]) {
    if (!Number.isFinite(fields[field]))
      throw new Error("Invalid memory counters");
  }
  return {
    memory: {
      total: fields.MemTotal,
      used: Math.max(0, fields.MemTotal - fields.MemAvailable),
    },
    swap: {
      total: fields.SwapTotal,
      used: Math.max(0, fields.SwapTotal - fields.SwapFree),
    },
  };
}

export function parseDiskIo(text: string, devices: string[]): Counters | null {
  const counters: Counters = {};
  for (const line of text.trim().split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (!devices.includes(fields[2])) continue;
    const first = Number(fields[5]) * 512;
    const second = Number(fields[9]) * 512;
    if (![first, second].every((value) => Number.isFinite(value) && value >= 0))
      return null;
    counters[fields[2]] = { first, second };
  }
  return Object.keys(counters).length ? counters : null;
}

function cpuPercent(current: CpuCounter, previous?: CpuCounter) {
  if (!previous) return null;
  const total = current.total - previous.total;
  const idle = current.idle - previous.idle;
  if (total <= 0 || idle < 0 || idle > total) return null;
  return Math.round(((total - idle) / total) * 1000) / 10;
}

function rates(
  current: Counters | null,
  previous: Counters | null,
  elapsed: number,
) {
  if (!current || !previous || elapsed <= 0) return null;
  const keys = Object.keys(current);
  // A NIC/disk reconnect must not look like a burst of traffic.
  if (
    keys.length !== Object.keys(previous).length ||
    keys.some(
      (key) =>
        !previous[key] ||
        current[key].first < previous[key].first ||
        current[key].second < previous[key].second,
    )
  )
    return null;
  return keys.reduce(
    (sum, key) => ({
      first: sum.first + (current[key].first - previous[key].first) / elapsed,
      second:
        sum.second + (current[key].second - previous[key].second) / elapsed,
    }),
    { first: 0, second: 0 },
  );
}

export function deriveSample(
  current: HostReading,
  previous: HostReading | null,
  at: number,
): MonitorSample {
  const elapsed = previous ? current.uptime - previous.uptime : 0;
  // Reboot, suspend, and inactive viewers all need a fresh baseline.
  const baseline = elapsed > 0 && elapsed <= 15 ? previous : null;
  const io = rates(current.io, baseline?.io ?? null, elapsed);
  const network = rates(current.network, baseline?.network ?? null, elapsed);
  const aggregate = current.cpu.find((cpu) => cpu.id === "cpu");
  if (!aggregate) throw new Error("Missing CPU counters");
  return monitorSampleSchema.parse({
    at,
    uptime: current.uptime,
    cpu: {
      model: current.model,
      percent: cpuPercent(
        aggregate,
        baseline?.cpu.find((cpu) => cpu.id === "cpu"),
      ),
      cores: current.cpu
        .filter((cpu) => cpu.id !== "cpu")
        .map((cpu) => ({
          id: cpu.id,
          percent: cpuPercent(
            cpu,
            baseline?.cpu.find((old) => old.id === cpu.id),
          ),
        })),
      load: current.load,
      frequency: current.frequency,
      temperature: current.temperature,
    },
    memory: current.memory,
    swap: current.swap,
    disk: current.disk,
    io: io ? { read: io.first, write: io.second } : null,
    network: network ? { received: network.first, sent: network.second } : null,
  });
}

const text = (path: string) => readFile(path, "utf8");
const optionalText = (path: string) => text(path).catch(() => null);
async function physicalDevices(path: string) {
  const names = await readdir(path);
  const physical = await Promise.all(
    names.map(async (name) => {
      try {
        await access(join(path, name, "device"));
        return name;
      } catch {
        return null;
      }
    }),
  );
  return physical.filter((name): name is string => name !== null);
}

async function readNetwork(sys: string): Promise<Counters | null> {
  try {
    const path = join(sys, "class/net");
    const names = await physicalDevices(path);
    if (!names.length) return null;
    const entries = await Promise.all(
      names.map(async (name) => {
        const [rx, tx] = await Promise.all([
          text(join(path, name, "statistics/rx_bytes")),
          text(join(path, name, "statistics/tx_bytes")),
        ]);
        const first = Number(rx.trim()),
          second = Number(tx.trim());
        if (
          ![first, second].every(
            (value) => Number.isFinite(value) && value >= 0,
          )
        )
          throw new Error("Invalid network counters");
        return [name, { first, second }] as const;
      }),
    );
    return Object.fromEntries(entries);
  } catch {
    return null;
  }
}

async function readTemperature(sys: string): Promise<number | null> {
  try {
    const path = join(sys, "class/hwmon");
    const chips = await readdir(path);
    const readings = await Promise.all(
      chips.map(async (chip) => {
        const folder = join(path, chip);
        const name = (await optionalText(join(folder, "name")))?.trim();
        if (
          !name ||
          !["coretemp", "k10temp", "zenpower", "cpu_thermal"].includes(name)
        )
          return [];
        const inputs = (await readdir(folder)).filter((file) =>
          /^temp\d+_input$/.test(file),
        );
        return Promise.all(
          inputs.map(async (input) => {
            const value = await optionalText(join(folder, input));
            return value === null ? Number.NaN : Number(value.trim()) / 1000;
          }),
        );
      }),
    );
    const valid = readings
      .flat()
      .filter(
        (value) => Number.isFinite(value) && value >= -20 && value <= 150,
      );
    return valid.length ? Math.max(...valid) : null;
  } catch {
    return null;
  }
}

// Only fixed, aggregate host files are read. Never traverse process directories,
// Docker sockets, configuration, addresses, hostnames, or command lines.
export async function readHostMetrics(root: string): Promise<HostReading> {
  const proc = join(root, "proc"),
    sys = join(root, "sys");
  const [stat, mem, uptime, load, cpuinfo, disk, io, network, temperature] =
    await Promise.all([
      text(join(proc, "stat")),
      text(join(proc, "meminfo")),
      text(join(proc, "uptime")),
      text(join(proc, "loadavg")),
      optionalText(join(proc, "cpuinfo")),
      statfs(join(root, "disk")),
      Promise.all([
        text(join(proc, "diskstats")),
        physicalDevices(join(sys, "block")),
      ])
        .then(([data, names]) => parseDiskIo(data, names))
        .catch(() => null),
      readNetwork(sys),
      readTemperature(sys),
    ]);
  const frequencies = [
    ...(cpuinfo ?? "").matchAll(/^cpu MHz\s*:\s*([\d.]+)/gm),
  ].map((match) => Number(match[1]));
  return {
    uptime: Number(uptime.trim().split(/\s+/)[0]),
    cpu: parseCpu(stat),
    model:
      cpuinfo
        ?.match(/^model name\s*:\s*(.+)$/m)?.[1]
        ?.trim()
        .slice(0, 120) ?? "Server CPU",
    frequency: frequencies.length
      ? frequencies.reduce((sum, value) => sum + value, 0) / frequencies.length
      : null,
    temperature,
    load: load.trim().split(/\s+/).slice(0, 3).map(Number) as [
      number,
      number,
      number,
    ],
    ...parseMemory(mem),
    disk: {
      total: disk.blocks * disk.bsize,
      used: (disk.blocks - disk.bfree) * disk.bsize,
    },
    io,
    network,
  };
}
