import { afterEach, expect, test } from "bun:test";
import {
  RealtimeConnection,
  RealtimeRequestError,
  type RealtimeStatus,
  RealtimeUnavailable,
} from "@/lib/realtime-connection";
import type { RealtimeFrame } from "@/lib/realtime-protocol";

const original = globalThis.WebSocket;
class FakeSocket {
  static OPEN = 1;
  static sockets: FakeSocket[] = [];
  readyState = 1;
  bufferedAmount = 0;
  sent: string[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_url: string) {
    FakeSocket.sockets.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  receive(frame: RealtimeFrame) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}
const connections: RealtimeConnection[] = [];
function setup() {
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  const frames: RealtimeFrame[] = [];
  const statuses: RealtimeStatus[] = [];
  const connection = new RealtimeConnection(
    "ws://localhost/api/realtime",
    (frame) => frames.push(frame),
    (status) => statuses.push(status),
  );
  connections.push(connection);
  connection.setActive(true);
  const socket = FakeSocket.sockets.at(-1);
  if (!socket) throw new Error("No socket created");
  return { connection, socket, frames, statuses };
}
afterEach(() => {
  for (const connection of connections) connection.dispose();
  connections.length = 0;
  FakeSocket.sockets.length = 0;
  globalThis.WebSocket = original;
});

test("commands wait for database-ready, and a new connection resyncs after a drop", async () => {
  const { connection, socket, frames, statuses } = setup();
  expect(connection.acknowledgeRead("conversation", 1)).toBeNull();
  socket.receive({ type: "ready" });
  expect(connection.live).toBe(true);
  socket.drop();
  expect(connection.live).toBe(false);
  expect(frames.at(-1)?.type).toBe("reconnect");
  await Bun.sleep(700);
  const next = FakeSocket.sockets.at(-1);
  expect(next).not.toBe(socket);
  socket.receive({ type: "signed-out" }); // A late old-socket frame is ignored.
  next?.receive({ type: "ready" });
  expect(connection.live).toBe(true);
  expect(statuses.at(-1)).toBe("live");
  expect(frames.filter((frame) => frame.type === "ready")).toHaveLength(2);
});

test("read acknowledgements correlate replies and distinguish application errors from transport loss", async () => {
  const { connection, socket } = setup();
  socket.receive({ type: "ready" });
  const read = connection.acknowledgeRead("conversation", 5);
  const { requestId } = JSON.parse(socket.sent[0]);
  socket.receive({ type: "result", requestId });
  await read;
  const denied = connection.acknowledgeRead("private", 5);
  const rejected = denied?.catch((error) => error);
  socket.receive({
    type: "error",
    requestId: JSON.parse(socket.sent[1]).requestId,
    status: 404,
    error: "Conversation not found.",
  });
  expect(await rejected).toBeInstanceOf(RealtimeRequestError);
  const lost = connection.acknowledgeRead("conversation", 6);
  const unavailable = lost?.catch((error) => error);
  socket.drop();
  expect(await unavailable).toBeInstanceOf(RealtimeUnavailable);
});

test("pause cancels pending requests, resume opens a fresh socket, and sign-out stops retries", async () => {
  const { connection, socket } = setup();
  socket.receive({ type: "ready" });
  const pending = connection.acknowledgeRead("conversation", 1);
  const rejected = pending?.catch((error) => error);
  connection.setActive(false);
  expect(await rejected).toBeInstanceOf(RealtimeUnavailable);
  socket.drop();
  await Bun.sleep(700);
  expect(FakeSocket.sockets).toHaveLength(1);
  connection.setActive(true);
  expect(FakeSocket.sockets).toHaveLength(2);
  FakeSocket.sockets.at(-1)?.receive({ type: "signed-out" });
  connection.setActive(true);
  await Bun.sleep(700);
  expect(FakeSocket.sockets).toHaveLength(2);
});

test("aborted reads release their slot and unfinished work is bounded", async () => {
  const { connection, socket } = setup();
  socket.receive({ type: "ready" });
  const abort = new AbortController();
  const pending = connection.acknowledgeRead("conversation", 1, abort.signal);
  const rejected = pending?.catch((error) => error);
  abort.abort();
  expect(await rejected).toHaveProperty("name", "AbortError");
  const reads = Array.from({ length: 32 }, () =>
    connection.acknowledgeRead("conversation", 2)?.catch(() => {}),
  );
  expect(connection.acknowledgeRead("conversation", 3)).toBeNull();
  connection.dispose();
  await Promise.all(reads);
});
