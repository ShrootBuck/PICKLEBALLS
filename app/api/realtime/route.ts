import { jsonError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getRealtimeHub } from "@/lib/realtime-server";
import type { RealtimeEvent } from "@/lib/realtime-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      return Response.json({ error: "Sign in first." }, { status: 401 });
    const encoder = new TextEncoder();
    let stop = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let checking = false;
        let checkAgain = false;
        let unsubscribe: (() => void) | undefined;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        let lastAuthCheck = 0;
        const close = () => {
          if (closed) return;
          closed = true;
          unsubscribe?.();
          clearInterval(heartbeat);
          request.signal.removeEventListener("abort", close);
          try {
            controller.close();
          } catch {
            /* Reader already cancelled. */
          }
        };
        stop = close;
        const send = (event: RealtimeEvent) => {
          if (closed) return;
          // A slow/disconnected reader must not accumulate an unbounded queue.
          if ((controller.desiredSize ?? 0) < -32) return close();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        };
        const checkSession = async () => {
          if (closed) return;
          if (checking) {
            checkAgain = true;
            return;
          }
          checking = true;
          lastAuthCheck = Date.now();
          try {
            const current = await getPrisma().session.findUnique({
              where: { id: session.session.id },
              select: { expiresAt: true },
            });
            if (!current || current.expiresAt.getTime() <= Date.now()) {
              send({ type: "signed-out" });
              close();
            }
          } catch {
            send({ type: "reconnect" });
            close();
          } finally {
            checking = false;
            if (checkAgain && !closed) {
              checkAgain = false;
              void checkSession();
            }
          }
        };
        request.signal.addEventListener("abort", close, { once: true });
        if (request.signal.aborted) return close();
        controller.enqueue(
          encoder.encode(
            `retry: ${2000 + Math.floor(Math.random() * 1000)}\n\n`,
          ),
        );
        try {
          unsubscribe = getRealtimeHub().subscribe(session.user.id, (event) => {
            if (event.type === "session") void checkSession();
            else {
              send(event);
              if (event.type === "reconnect") close();
            }
          });
        } catch (error) {
          request.signal.removeEventListener("abort", close);
          throw error;
        }
        heartbeat = setInterval(() => {
          send({ type: "ping" });
          if (Date.now() - lastAuthCheck >= 60_000) void checkSession();
        }, 15_000);
        void checkSession();
      },
      cancel() {
        stop();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-cache, no-store, no-transform",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
