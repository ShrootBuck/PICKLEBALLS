import "server-only";

import { after, NextResponse } from "next/server";

// A finite response: acknowledge the committed proof immediately, then signal
// assessment completion. Legacy/API callers can keep using ordinary JSON.
export function proofProgressResponse(
  request: Request,
  saved: unknown,
  status: number,
  assess: () => Promise<void>,
) {
  if (!request.headers.get("accept")?.includes("application/x-ndjson")) {
    after(assess);
    return NextResponse.json(saved, { status });
  }

  const completion = Promise.resolve()
    .then(assess)
    .catch((error: unknown) => {
      console.warn("Proof completion failed", {
        errorType: error instanceof Error ? error.name : "Unknown",
      });
    });
  // Keep assessment alive even if the phone disconnects from the response.
  after(() => completion);
  const encoder = new TextEncoder();
  let connected = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`${JSON.stringify({ type: "saved", data: saved })}\n`),
      );
      void completion.then(() => {
        if (!connected) return;
        controller.enqueue(encoder.encode('{"type":"complete"}\n'));
        controller.close();
      });
    },
    cancel() {
      connected = false;
    },
  });
  return new Response(stream, {
    status,
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
