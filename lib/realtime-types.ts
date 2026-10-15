import { z } from "zod";

const id = z.string().min(1).max(200);
export const realtimeEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("refresh"), circleId: id.optional() }),
  z.object({ type: z.literal("messages"), conversationId: id.optional() }),
  z.object({
    type: z.literal("typing"),
    conversationId: id,
    userId: id,
    clientId: z.string().uuid(),
    active: z.boolean(),
    expiresAt: z.number().finite(),
  }),
  z.object({ type: z.literal("media") }),
  z.object({ type: z.literal("timeblock-chat") }),
  z.object({ type: z.literal("session") }),
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("reconnect") }),
  z.object({ type: z.literal("signed-out") }),
]);
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export const realtimeEnvelopeSchema = z.object({
  scope: z.enum(["user", "circle"]),
  id,
  event: realtimeEventSchema,
});
export type RealtimeEnvelope = z.infer<typeof realtimeEnvelopeSchema>;
export const realtimeChannel = "pickleballs_realtime";
export const typingLifetimeMs = 6000;
