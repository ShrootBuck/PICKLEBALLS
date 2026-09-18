import { expect, test } from "bun:test";
import { uploadMedia } from "@/lib/media-upload";

test("processing video checks once and a manual retry reuses the uploaded file", async () => {
  const savedFetch = globalThis.fetch;
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const savedXhr = Object.getOwnPropertyDescriptor(
    globalThis,
    "XMLHttpRequest",
  );
  let ready = false;
  let tickets = 0;
  let uploads = 0;
  let statusReads = 0;
  class UploadRequest {
    upload = {};
    status = 200;
    onload?: () => void;
    open() {}
    setRequestHeader() {}
    send() {
      uploads++;
      queueMicrotask(() => this.onload?.());
    }
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new EventTarget(),
  });
  Object.defineProperty(globalThis, "XMLHttpRequest", {
    configurable: true,
    value: UploadRequest,
  });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === "/api/media") {
      tickets++;
      return Response.json({ id: "v_test", url: "https://upload.example" });
    }
    if (url.startsWith("/api/media/status?")) {
      statusReads++;
      return Response.json({ media: [{ ready, progress: 25 }] });
    }
    return Response.json({ id: "v_test", ready });
  }) as typeof fetch;
  try {
    const file = new File(["video"], "test.mp4", { type: "video/mp4" });
    await expect(uploadMedia([file])).rejects.toThrow("still processing");
    expect(statusReads).toBe(1);
    ready = true;
    expect(await uploadMedia([file])).toEqual(["v_test"]);
    expect(statusReads).toBe(2);
    expect(tickets).toBe(1);
    expect(uploads).toBe(1);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (savedXhr) Object.defineProperty(globalThis, "XMLHttpRequest", savedXhr);
    else Reflect.deleteProperty(globalThis, "XMLHttpRequest");
  }
});
