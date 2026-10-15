import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  type DirectMessageItem,
  directMessageSchema,
  mergeDirectMessages,
  messageReceipts,
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
    clientId: randomUUID(),
    senderId: "user",
    sender: { id: "user", name: "User", image: null, initials: "U" },
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

test("read receipts keep the last seen boundary alongside newer unread sends", () => {
  const message = (
    id: string,
    sequence: number,
    senderId = "me",
    deletedAt: string | null = null,
  ): DirectMessageItem => ({
    id,
    clientId: randomUUID(),
    sequence,
    senderId,
    deletedAt,
    sender: null,
    revision: sequence,
    body: id,
    mediaIds: [],
    reactions: [],
    createdAt: new Date().toISOString(),
  });
  const messages = [
    message("read", 1),
    message("reply", 2, "peer"),
    message("unread", 3),
    message("deleted", 4, "me", "2026-10-15"),
  ];
  expect([...messageReceipts(messages, "me", 2, true)]).toEqual([
    ["unread", "Sent"],
    ["read", "Seen"],
  ]);
  expect([...messageReceipts(messages, "me", 4, true)]).toEqual([
    ["unread", "Seen"],
  ]);
  expect([...messageReceipts(messages, "me", 0, true)]).toEqual([
    ["unread", "Sent"],
  ]);
  expect([...messageReceipts(messages, "me", 4, false)]).toEqual([
    ["unread", "Sent"],
  ]);
});
