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
  clientId: string;
  senderId: string | null;
  sender: DirectPerson | null;
  sequence: number;
  revision: number;
  body: string;
  mediaIds: string[];
  createdAt: string;
  deletedAt: string | null;
  reactions: { userId: string; emoji: string }[];
};
export type ConversationDetails =
  | { kind: "direct"; person: DirectPerson; group: null }
  | { kind: "group"; person: null; group: { id: string; name: string } };
export const conversationName = (chat: ConversationDetails) =>
  chat.kind === "group" ? chat.group.name : chat.person.name;

export type DirectThread = ConversationDetails & {
  id: string;
  revision: number;
  readThrough: number;
  messages: DirectMessageItem[];
  hasMore: boolean;
  moreChanges: boolean;
};
export type DirectInboxItem = ConversationDetails & {
  id: string;
  lastMessage: DirectMessageItem | null;
  unread: number;
};

export function messagePreview(message: DirectMessageItem | null) {
  if (!message) return "No messages yet";
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

// Keep the read boundary visible while newer outgoing messages are still unread.
export function messageReceipts(
  messages: DirectMessageItem[],
  viewerId: string,
  readThrough: number,
  direct: boolean,
) {
  const receipts = new Map<string, "Sent" | "Seen">();
  const own = messages.filter(
    (message) => message.senderId === viewerId && !message.deletedAt,
  );
  const latest = own.at(-1);
  const seen = direct
    ? own.findLast((message) => message.sequence <= readThrough)
    : undefined;
  if (latest) receipts.set(latest.id, "Sent");
  if (seen) receipts.set(seen.id, "Seen");
  return receipts;
}
