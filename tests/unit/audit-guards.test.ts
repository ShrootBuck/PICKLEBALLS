import { describe, expect, test } from "bun:test";
import { parseActiveCircleId } from "@/lib/circle-cookie";
import { safeAppPath } from "@/lib/navigation";
import { isPushEndpoint } from "@/lib/push-endpoint";
import { readBoundedBody } from "@/lib/request-body";
import { parseDateKey } from "@/lib/time";
import { parseTimeblockDraft } from "@/lib/timeblock-draft";

describe("untrusted input guards", () => {
  test("invalid calendar dates never throw or roll into another day", () => {
    for (const value of [
      "2026-99-99",
      "2026-02-29",
      "2026-04-31",
      "nope",
      "2026-00-01",
    ]) {
      expect(parseDateKey(value)).toBeNull();
    }
    expect(parseDateKey("2024-02-29")?.toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    );
  });
  test("malformed circle cookies do not break authenticated pages", () => {
    expect(parseActiveCircleId("pb_active_circle=%ZZ")).toBeNull();
    expect(
      parseActiveCircleId("another=value; pb_active_circle=circle-123"),
    ).toBe("circle-123");
    expect(parseActiveCircleId(null)).toBeNull();
  });
  test("notification destinations remain on this site", () => {
    for (const path of [
      "//evil.invalid",
      "/\\evil.invalid",
      "https://evil.invalid",
      "/\n/evil.invalid",
      null,
    ]) {
      expect(safeAppPath(path)).toBe("/squad");
    }
    expect(safeAppPath("/squad?circle=abc&focus=xyz")).toBe(
      "/squad?circle=abc&focus=xyz",
    );
  });
  test("push destinations allow browser services and reject arbitrary hosts", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/abc",
      "https://wns2.notify.windows.com/abc",
    ])
      expect(isPushEndpoint(endpoint)).toBe(true);
    for (const endpoint of [
      "http://fcm.googleapis.com/abc",
      "https://fcm.googleapis.com.evil.invalid/",
      "https://evil@fcm.googleapis.com/",
      "https://localhost/",
      "https://fcm.googleapis.com:8443/",
      "https://127.0.0.1/",
      "garbage",
    ])
      expect(isPushEndpoint(endpoint)).toBe(false);
  });
  test("body limits count bytes, including multibyte text without a length header", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: "🎾🎾",
    });
    await expect(readBoundedBody(request, 7)).rejects.toMatchObject({
      status: 413,
    });
    const valid = new Request("http://localhost", {
      method: "POST",
      body: "🎾🎾",
    });
    expect(new TextDecoder().decode(await readBoundedBody(valid, 8))).toBe(
      "🎾🎾",
    );
  });
  test("oversized streamed bodies stop reading immediately", async () => {
    let canceled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(9));
      },
      cancel() {
        canceled = true;
      },
    });
    const request = new Request("http://localhost", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    await expect(readBoundedBody(request, 8)).rejects.toMatchObject({
      status: 413,
    });
    expect(canceled).toBe(true);
  });
  test("corrupt and duplicate local drafts are ignored without losing server data", () => {
    const row = {
      id: "manual-one",
      title: "Physics",
      startedAt: "2026-09-04T16:00",
      completedAt: "2026-09-04T17:00",
      status: null,
      included: true,
    };
    const encode = (rows: unknown[]) => JSON.stringify({ version: 1, rows });
    expect(parseTimeblockDraft(encode([row]))).toEqual([row]);
    for (const value of [
      "{",
      encode([row, row]),
      encode([{ ...row, included: "yes" }]),
      encode(Array(57).fill(row)),
    ])
      expect(parseTimeblockDraft(value)).toBeNull();
  });
});
