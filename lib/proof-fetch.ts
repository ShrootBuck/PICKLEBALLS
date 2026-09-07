import { holdAppRefresh, requestAppRefresh } from "@/lib/app-refresh";
import { proofProgress } from "@/lib/proof-progress";

export async function proofFetch(
  url: string,
  init: RequestInit,
  onComplete?: () => void,
) {
  const release = holdAppRefresh();
  try {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/x-ndjson");
    const response = await fetch(url, { ...init, headers });
    if (!response.ok) return response;
    if (
      !response.headers.get("content-type")?.includes("application/x-ndjson")
    ) {
      requestAppRefresh();
      onComplete?.();
      return response;
    }
    if (!response.body) throw new Error("Missing proof response.");
    const messages = proofProgress(response.body);
    const first = await messages.next();
    if (first.done || first.value.type !== "saved") {
      await messages.return();
      throw new Error("Missing proof confirmation.");
    }
    requestAppRefresh();
    // Outlives the dialog and client-side navigation. A disconnected stream
    // never turns an acknowledged save into an apparent failed submission.
    void (async () => {
      try {
        for await (const message of messages) {
          if (message.type === "complete") break;
        }
      } catch {
        // Catch up now if possible, otherwise on focus/reconnect/navigation.
      } finally {
        requestAppRefresh();
        onComplete?.();
      }
    })();
    return Response.json(first.value.data, { status: response.status });
  } finally {
    release();
  }
}
