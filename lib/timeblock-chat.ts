import type { FileUIPart } from "ai";
import { z } from "zod";
import type { TimeblockAgentMessage } from "@/lib/timeblock-agent";

export const CHAT_FILE_LIMIT = 6;
export const CHAT_FILE_BYTES = 100 * 1024 * 1024;
export const CHAT_TEXT_FILE_BYTES = 1024 * 1024;
export const chatMediaTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aiff",
  "audio/x-aiff",
  "audio/pcm16",
  "audio/pcm24",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;
export const chatFileAccept = [
  ...chatMediaTypes,
  ".md",
  ".txt",
  ".csv",
  ".json",
].join(",");
export const chatUploadSchema = z
  .object({
    chatId: z.string().min(1).max(100),
    filename: z.string().min(1).max(240),
    mediaType: z.enum(chatMediaTypes),
    sizeBytes: z.number().int().positive().max(CHAT_FILE_BYTES),
  })
  .refine(
    (file) =>
      !isTextAttachment(file.mediaType) ||
      file.sizeBytes <= CHAT_TEXT_FILE_BYTES,
    "Text files must be 1 MB or smaller.",
  );
export function isTextAttachment(mediaType: string) {
  return mediaType.startsWith("text/") || mediaType === "application/json";
}
export function chatFileType(file: Pick<File, "name" | "type">) {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const fallback: Record<string, string> = {
    md: "text/markdown",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    m4a: "audio/mp4",
  };
  return fallback[extension ?? ""] ?? file.type;
}
export const chatUserMessageSchema = z
  .object({
    id: z.string().min(1).max(100),
    role: z.literal("user"),
    parts: z
      .array(
        z.discriminatedUnion("type", [
          z.object({
            type: z.literal("text"),
            text: z.string().trim().min(1).max(32000),
          }),
          z.object({
            type: z.literal("file"),
            url: z
              .string()
              .regex(/^\/api\/timeblocks\/chat\/files\/[a-zA-Z0-9-]+$/),
            mediaType: z.enum(chatMediaTypes),
            filename: z.string().max(240).optional(),
          }),
        ]),
      )
      .min(1)
      .max(CHAT_FILE_LIMIT + 1),
  })
  .refine(
    (m) =>
      m.parts.filter((p) => p.type === "file").length <= CHAT_FILE_LIMIT &&
      m.parts.filter((p) => p.type === "text").length <= 1,
  );

export type TimeblockChatSnapshot = {
  id: string;
  messages: TimeblockAgentMessage[];
  revision: number;
  running: boolean;
  error: string | null;
};
export function attachmentPart(file: {
  id: string;
  filename: string;
  mediaType: string;
}): FileUIPart {
  return {
    type: "file",
    url: `/api/timeblocks/chat/files/${file.id}`,
    mediaType: file.mediaType,
    filename: file.filename,
  };
}

// Incomplete tool calls can be displayed in history, but must never be replayed
// to a provider as calls without results after Stop, timeout, or a process crash.
export function completedChatHistory(messages: TimeblockAgentMessage[]) {
  return messages
    .map((message) => ({
      ...message,
      parts: message.parts.filter(
        (part) =>
          !part.type.startsWith("tool-") ||
          ("state" in part &&
            (part.state === "output-available" ||
              part.state === "output-error")),
      ),
    }))
    .filter((message) => message.parts.length > 0);
}
