import { z } from "zod";
import { mediaIdsSchema } from "@/lib/media-policy";

export const directEmojis = ["❤️", "😂", "🔥", "👍", "😮", "😢"] as const;
export const directMessageSchema = z
  .object({
    clientId: z.string().uuid(),
    body: z.string().trim().max(4000).default(""),
    mediaIds: mediaIdsSchema.default([]),
  })
  .refine(
    (input) => input.body.length > 0 || input.mediaIds.length > 0,
    "Write a message or attach a photo or video.",
  );
export const directReactionSchema = z.object({
  emoji: z.enum(directEmojis).nullable(),
});

export type DirectPerson = {
  id: string;
  name: string;
  image: string | null;
  initials: string;
};
export type DirectMessageItem = {
  id: string;
  senderId: string;
  sequence: number;
  revision: number;
  body: string;
  mediaIds: string[];
  createdAt: string;
  deletedAt: string | null;
  reactions: { userId: string; emoji: string }[];
};
export type DirectThread = {
  id: string;
  person: DirectPerson;
  revision: number;
  readThrough: number;
  messages: DirectMessageItem[];
  hasMore: boolean;
  moreChanges: boolean;
};
export type DirectInboxItem = {
  id: string;
  person: DirectPerson;
  lastMessage: DirectMessageItem | null;
  unread: number;
};

export function messagePreview(message: DirectMessageItem | null) {
  if (!message) return "Start the conversation";
  if (message.deletedAt) return "Message deleted";
  if (message.body) return message.body;
  return message.mediaIds.length === 1
    ? message.mediaIds[0].startsWith("v_")
      ? "Video"
      : "Photo"
    : `${message.mediaIds.length} attachments`;
}

export function mergeDirectMessages(
  current: DirectMessageItem[],
  incoming: DirectMessageItem[],
  mode: "history" | "updates" = "history",
) {
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) {
    // A reaction on an unloaded older page must not move the pagination boundary
    // past the intervening messages. That page will read its latest revision later.
    if (
      mode === "updates" &&
      current.length &&
      row.sequence < current[0].sequence
    )
      continue;
    const previous = rows.get(row.id);
    if (!previous || row.revision >= previous.revision) rows.set(row.id, row);
  }
  return [...rows.values()].sort((a, b) => a.sequence - b.sequence);
}
