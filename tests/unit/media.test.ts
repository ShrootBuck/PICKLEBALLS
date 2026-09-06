import { describe, expect, test } from "bun:test";
import { verifyMediaCopy } from "@/lib/media-migration";
import { mediaIdsSchema, uploadTicketSchema } from "@/lib/media-policy";
import { socialReplySchema } from "@/lib/schemas";

const image = "i_00000000-0000-4000-8000-000000000000";

describe("media validation", () => {
  test("allows media-only replies, rejects empty replies and duplicate/arbitrary attachments", () => {
    const reply = { targetType: "PROOF", targetId: "proof", body: "" };
    expect(socialReplySchema.safeParse(reply).success).toBe(false);
    expect(
      socialReplySchema.safeParse({ ...reply, mediaIds: [image] }).success,
    ).toBe(true);
    expect(mediaIdsSchema.safeParse([image, image]).success).toBe(false);
    expect(mediaIdsSchema.safeParse(["../../private"]).success).toBe(false);
    expect(
      mediaIdsSchema.safeParse(
        Array.from({ length: 7 }, (_, i) => image.slice(0, -1) + i),
      ).success,
    ).toBe(false);
  });
  test("bounds uploads and excludes executable content", () => {
    expect(
      uploadTicketSchema.safeParse({
        mimeType: "video/mp4",
        sizeBytes: 50 * 1024 * 1024,
      }).success,
    ).toBe(true);
    expect(
      uploadTicketSchema.safeParse({
        mimeType: "video/mp4",
        sizeBytes: 50 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
    expect(
      uploadTicketSchema.safeParse({
        mimeType: "image/webp",
        sizeBytes: 4 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
    expect(
      uploadTicketSchema.safeParse({
        mimeType: "image/svg+xml",
        sizeBytes: 100,
      }).success,
    ).toBe(false);
    expect(
      uploadTicketSchema.safeParse({ mimeType: "image/png", sizeBytes: 0 })
        .success,
    ).toBe(false);
  });
});
describe("legacy photo verification", () => {
  const source = new Uint8Array([1, 2, 3]);
  test("accepts identical bytes", async () => {
    await expect(
      verifyMediaCopy(source, "key", async () => source.slice()),
    ).resolves.toBeUndefined();
  });
  test("rejects truncation and same-size corruption", async () => {
    await expect(
      verifyMediaCopy(source, "key", async () => new Uint8Array([1, 2])),
    ).rejects.toThrow("database bytes retained");
    await expect(
      verifyMediaCopy(source, "key", async () => new Uint8Array([1, 2, 4])),
    ).rejects.toThrow("database bytes retained");
  });
  test("propagates failed remote reads", async () => {
    await expect(
      verifyMediaCopy(source, "key", async () => {
        throw new Error("missing");
      }),
    ).rejects.toThrow("missing");
  });
});

test("avatar proxy only accepts known Discord image paths", async () => {
  const { discordAvatarUrl, avatarSrc } = await import("@/lib/avatar-url");
  expect(
    discordAvatarUrl("https://cdn.discordapp.com/embed/avatars/0.png"),
  ).toBe("https://cdn.discordapp.com/embed/avatars/0.png?size=128");
  for (const value of [
    "http://127.0.0.1/private",
    "https://cdn.discordapp.com.evil.test/avatars/1/abc.png",
    "https://cdn.discordapp.com/attachments/private",
    "https://user:pass@cdn.discordapp.com/embed/avatars/0.png",
  ])
    expect(discordAvatarUrl(value)).toBeNull();
  expect(
    avatarSrc("https://cdn.discordapp.com/embed/avatars/0.png"),
  ).toStartWith("/api/avatar?");
});
