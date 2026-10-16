import { z } from "zod";
import type { DirectThread } from "@/lib/direct-message-types";
import { realtimeEventSchema } from "@/lib/realtime-types";

const id = z.string().min(1).max(200);
const position = z.number().int().min(0).max(2147483647);
export const typingInputSchema = z.object({
  active: z.boolean(),
  clientId: z.string().uuid(),
});
export const realtimeCommandSchema = z.discriminatedUnion("type", [
  typingInputSchema.extend({ type: z.literal("typing"), conversationId: id }),
  z.object({
    type: z.literal("watch-thread"),
    subscriptionId: z.string().uuid(),
    conversationId: id,
    sinceRevision: position.optional(),
  }),
  z.object({
    type: z.literal("unwatch-thread"),
    subscriptionId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("read"),
    requestId: z.string().uuid(),
    conversationId: id,
    through: position,
  }),
]);
export type RealtimeCommand = z.infer<typeof realtimeCommandSchema>;
export type ThreadFrame = {
  type: "thread";
  subscriptionId: string;
  thread: DirectThread;
};
export const realtimeFrameSchema = z.union([
  realtimeEventSchema,
  z.object({
    type: z.literal("thread"),
    subscriptionId: z.string().uuid(),
    // Data comes from directThread on our authenticated server. Keep the
    // domain type shared instead of shipping another copy of its schema.
    thread: z.custom<DirectThread>(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "id" in value &&
        "revision" in value &&
        "messages" in value &&
        typeof value.id === "string" &&
        typeof value.revision === "number" &&
        Array.isArray(value.messages),
    ),
  }),
  z.object({ type: z.literal("result"), requestId: z.string().uuid() }),
  z.object({
    type: z.literal("error"),
    requestId: z.string().uuid().optional(),
    subscriptionId: z.string().uuid().optional(),
    status: z.number().int(),
    error: z.string(),
  }),
]);
export type RealtimeFrame = z.infer<typeof realtimeFrameSchema>;
