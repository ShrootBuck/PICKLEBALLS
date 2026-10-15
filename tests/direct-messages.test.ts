import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  type DirectMessageItem,
  directMessageSchema,
  mergeDirectMessages,
} from "@/lib/direct-message-types";

test("blank messages, excessive text, duplicate files, and invalid attachment ids are rejected", () => {
  const base = { clientId: randomUUID(), body: "hello", mediaIds: [] };
  expect(directMessageSchema.safeParse({ ...base, body: " \n " }).success).toBe(
    false,
  );
  expect(
    directMessageSchema.safeParse({ ...base, body: "x".repeat(4001) }).success,
  ).toBe(false);
  expect(
    directMessageSchema.safeParse({ ...base, mediaIds: ["not-media"] }).success,
  ).toBe(false);
  const file = `i_${randomUUID()}`;
  expect(
    directMessageSchema.safeParse({ ...base, body: "", mediaIds: [file] })
      .success,
  ).toBe(true);
  expect(
    directMessageSchema.safeParse({ ...base, mediaIds: [file, file] }).success,
  ).toBe(false);
});

test("an older fetch cannot resurrect a deleted message or undo a reaction; new messages sort by sequence", () => {
  const original: DirectMessageItem = {
    id: "a",
    senderId: "user",
    sequence: 1,
    revision: 1,
    body: "hello",
    mediaIds: [],
    createdAt: "2026-10-14T20:00:00Z",
    deletedAt: null,
    reactions: [],
  };
  const deleted = {
    ...original,
    revision: 3,
    body: "",
    deletedAt: "2026-10-14T21:00:00Z",
  };
  const newer = { ...original, id: "b", sequence: 2, revision: 2 };
  expect(mergeDirectMessages([deleted], [newer, original])).toEqual([
    deleted,
    newer,
  ]);
  // Reacting to an unseen old message cannot skip the unloaded middle history.
  expect(mergeDirectMessages([newer], [deleted], "updates")).toEqual([newer]);
  expect(mergeDirectMessages([newer], [deleted], "history")).toEqual([
    deleted,
    newer,
  ]);
});
