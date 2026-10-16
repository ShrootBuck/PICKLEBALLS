import "server-only";

import { createServer, type IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { type AuthSession, auth } from "@/lib/auth";
import { directThread, readDirectMessages } from "@/lib/direct-messages";
import { DomainError } from "@/lib/errors";
import { LiveRefresh } from "@/lib/live-refresh";
import { publishTyping } from "@/lib/message-typing";
import { getPrisma } from "@/lib/prisma";
import { limitAction } from "@/lib/rate-limit";
import {
  type RealtimeCommand,
  type RealtimeFrame,
  realtimeCommandSchema,
} from "@/lib/realtime-protocol";
import { getRealtimeHub } from "@/lib/realtime-server";
import { hasSameOrigin } from "@/lib/request-origin";

function requestHeaders(request: IncomingMessage) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value))
      for (const item of value) headers.append(key, item);
    else if (value !== undefined) headers.set(key, value);
  }
  return headers;
}

function connectClient(socket: WebSocket, session: AuthSession) {
  const hub = getRealtimeHub();
  const watches = new Map<
    string,
    { conversationId: string; queue: LiveRefresh }
  >();
  let unsubscribe: (() => void) | undefined;
  let alive = true;
  let lastPong = Date.now();
  let lastAuthCheck = 0;
  let authCheck: Promise<boolean> | undefined;
  let checkingAgain = false;
  let queued = 0;
  let commands = Promise.resolve();
  let windowStart = Date.now();
  let received = 0;
  const send = (frame: RealtimeFrame) => {
    if (!alive || socket.readyState !== WebSocket.OPEN) return;
    // Snapshots can be larger than invalidations, but a stalled client must
    // never accumulate unbounded message bodies in the web process.
    if (socket.bufferedAmount > 2 * 1024 * 1024) return socket.terminate();
    socket.send(JSON.stringify(frame));
  };
  const end = (signedOut = false) => {
    send({ type: signedOut ? "signed-out" : "reconnect" });
    socket.close(signedOut ? 4001 : 1012);
  };
  const checkSession = (): Promise<boolean> => {
    if (!alive) return Promise.resolve(false);
    if (authCheck) return authCheck;
    lastAuthCheck = Date.now();
    authCheck = (async () => {
      try {
        const current = await getPrisma().session.findUnique({
          where: { id: session.session.id },
          select: { userId: true, expiresAt: true },
        });
        if (
          !current ||
          current.userId !== session.user.id ||
          current.expiresAt.getTime() <= Date.now()
        ) {
          end(true);
          return false;
        }
        return alive;
      } catch {
        end();
        return false;
      } finally {
        authCheck = undefined;
        if (checkingAgain && alive) {
          checkingAgain = false;
          void checkSession();
        }
      }
    })();
    return authCheck;
  };
  const errorFrame = (
    error: unknown,
    ids: { requestId?: string; subscriptionId?: string },
  ) => {
    const expected = error instanceof DomainError;
    if (!expected) console.error("Realtime operation failed", error);
    send({
      type: "error",
      ...ids,
      status: expected ? error.status : 503,
      error: expected
        ? error.message
        : "Couldn't refresh messages. Retrying shortly.",
    });
  };
  const unwatch = (id: string) => {
    watches.get(id)?.queue.dispose();
    watches.delete(id);
  };
  const handle = async (command: RealtimeCommand) => {
    if (!(await checkSession())) return;
    switch (command.type) {
      case "typing":
        await publishTyping(session.user.id, command.conversationId, command);
        break;
      case "read":
        await readDirectMessages(
          session.user.id,
          command.conversationId,
          command.through,
        );
        send({ type: "result", requestId: command.requestId });
        break;
      case "unwatch-thread":
        unwatch(command.subscriptionId);
        break;
      case "watch-thread": {
        if (!watches.has(command.subscriptionId) && watches.size >= 4)
          throw new DomainError("Too many open conversations.", 429);
        unwatch(command.subscriptionId);
        let revision = command.sinceRevision;
        const watch = {
          conversationId: command.conversationId,
          queue: new LiveRefresh(async () => {
            try {
              if (!(await checkSession())) return;
              const thread = await directThread(
                session.user.id,
                command.conversationId,
                { sinceRevision: revision },
              );
              if (!alive || watches.get(command.subscriptionId) !== watch)
                return;
              // Re-check after the read too: a revoked session must not receive
              // a snapshot that was still in flight when it signed out.
              if (!(await checkSession())) return;
              revision = thread.revision;
              send({
                type: "thread",
                subscriptionId: command.subscriptionId,
                thread,
              });
              if (thread.moreChanges) watch.queue.request();
            } catch (error) {
              if (!alive || watches.get(command.subscriptionId) !== watch)
                return;
              errorFrame(error, { subscriptionId: command.subscriptionId });
              if (error instanceof DomainError && error.status < 500)
                unwatch(command.subscriptionId);
              else throw error; // LiveRefresh retries transient DB failures.
            }
          }),
        };
        watches.set(command.subscriptionId, watch);
        watch.queue.request();
        break;
      }
    }
  };
  const heartbeat = setInterval(() => {
    if (Date.now() - lastPong > 45_000) return socket.terminate();
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.ping();
    send({ type: "ping" });
    if (Date.now() - lastAuthCheck >= 60_000) void checkSession();
  }, 15_000);
  heartbeat.unref();
  socket.on("pong", () => {
    lastPong = Date.now();
  });
  socket.on("error", () => socket.terminate());
  socket.on("close", () => {
    alive = false;
    unsubscribe?.();
    clearInterval(heartbeat);
    for (const id of watches.keys()) unwatch(id);
  });
  socket.on("message", (data, binary) => {
    // Bound both incoming frames and unfinished asynchronous work. A flood
    // cannot become an unbounded promise chain or database queue.
    if (Date.now() - windowStart >= 1000) {
      windowStart = Date.now();
      received = 0;
    }
    if (binary || ++received > 30 || queued >= 32) return socket.close(1008);
    let command: RealtimeCommand;
    try {
      command = realtimeCommandSchema.parse(JSON.parse(data.toString()));
    } catch {
      socket.close(1008);
      return;
    }
    queued++;
    commands = commands
      .then(async () => {
        if (!alive) return;
        try {
          await handle(command);
        } catch (error) {
          errorFrame(error, {
            requestId: "requestId" in command ? command.requestId : undefined,
            subscriptionId:
              "subscriptionId" in command ? command.subscriptionId : undefined,
          });
        }
      })
      .finally(() => {
        queued--;
      });
  });
  try {
    unsubscribe = hub.subscribe(session.user.id, (event) => {
      if (event.type === "session") {
        if (authCheck) checkingAgain = true;
        void checkSession();
        return;
      }
      send(event);
      if (event.type === "reconnect") socket.close(1012);
      if (event.type === "messages" || event.type === "refresh") {
        for (const watch of watches.values())
          if (
            event.type === "refresh" ||
            !event.conversationId ||
            event.conversationId === watch.conversationId
          )
            watch.queue.request();
      }
    });
    void checkSession();
  } catch {
    socket.close(1013);
  }
}

/** Private listener. Next proxies /api/realtime upgrades on its existing port. */
export async function createRealtimeWebSocketServer(port: number) {
  const server = createServer((_request, response) => {
    response.writeHead(426, {
      "cache-control": "private, no-store",
      Upgrade: "websocket",
    });
    response.end("WebSocket connection required.");
  });
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
    perMessageDeflate: false,
  });
  let handshakes = 0;
  server.on("upgrade", (request, socket, head) => {
    const fail = (status: number) => {
      if (!socket.destroyed)
        socket.end(
          `HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
        );
    };
    if (request.url !== "/api/realtime" || handshakes >= 128) return fail(404);
    const timer = setTimeout(() => socket.destroy(), 10_000);
    const socketError = () => socket.destroy();
    socket.on("error", socketError);
    handshakes++;
    void (async () => {
      try {
        const headers = requestHeaders(request);
        // Next rewrites the upstream Host. Trust configured public origins,
        // never that internal Host or an origin supplied by the client itself.
        const publicUrl =
          process.env.NEXT_PUBLIC_APP_URL ||
          process.env.BETTER_AUTH_URL ||
          "http://localhost:3000";
        if (
          !headers.get("origin") ||
          !hasSameOrigin(new Request(publicUrl, { headers }))
        )
          return fail(403);
        const session = await auth.api.getSession({ headers });
        if (!session) return fail(401);
        await limitAction(session.user.id, "realtime-connect", 60, 60_000);
        if (socket.destroyed) return;
        sockets.handleUpgrade(request, socket, head, (client) =>
          connectClient(client, session),
        );
      } catch (error) {
        fail(error instanceof DomainError ? error.status : 503);
      } finally {
        clearTimeout(timer);
        socket.removeListener("error", socketError);
        handshakes--;
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  return {
    server,
    async close() {
      for (const socket of sockets.clients) socket.terminate();
      await Promise.all([
        new Promise<void>((resolve) => sockets.close(() => resolve())),
        new Promise<void>((resolve) => server.close(() => resolve())),
      ]);
    },
  };
}

const globals = globalThis as typeof globalThis & {
  pickleBallsWebSocket?: ReturnType<typeof createRealtimeWebSocketServer>;
};
export function startRealtimeWebSocketServer() {
  globals.pickleBallsWebSocket ??= createRealtimeWebSocketServer(
    Number(process.env.PB_REALTIME_PORT || 3010),
  );
  return globals.pickleBallsWebSocket;
}
