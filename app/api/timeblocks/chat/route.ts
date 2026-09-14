import { createAgentUIStreamResponse } from "ai";
import { z } from "zod";
import { aiHourlyLimit } from "@/lib/ai-config";
import { jsonError, readJson } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { createTimeblockAgent } from "@/lib/timeblock-agent";
import { timeblockDraftSchema } from "@/lib/timeblock-draft";
import { timeblockRoutineSchema } from "@/lib/timeblock-routine";
import { isMondayDateKey } from "@/lib/timeblocks";

export const runtime = "nodejs";
export const maxDuration = 120;
const requestSchema = z.object({
  routine: timeblockRoutineSchema,
  dueMonday: z.string().refine(isMondayDateKey),
  rows: timeblockDraftSchema.shape.rows.refine(
    (rows) => new Set(rows.map((r) => r.id)).size === rows.length,
  ),
  // Only conversational text is accepted from history. Tool state is rebuilt
  // from the supplied current draft, so old or interrupted calls cannot replay.
  messages: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        role: z.enum(["user", "assistant"]),
        parts: z
          .array(
            z.object({ type: z.literal("text"), text: z.string().max(8000) }),
          )
          .min(1)
          .max(8),
      }),
    )
    .min(1)
    .max(24),
});

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const parsed = requestSchema.safeParse(await readJson(request, 256_000));
    if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user")
      throw new DomainError("Send a message with a valid timeblock draft.");
    if (!process.env.OPENROUTER_API_KEY)
      throw new DomainError(
        "The AI editor is not configured yet. You can still edit blocks manually.",
        503,
      );
    await limitAction(auth.session.user.id, "ai", aiHourlyLimit, 3_600_000);
    return await createAgentUIStreamResponse({
      agent: createTimeblockAgent(
        auth.session.user.id,
        parsed.data.dueMonday,
        parsed.data.rows,
        parsed.data.routine,
      ),
      uiMessages: parsed.data.messages,
      abortSignal: request.signal,
      timeout: 110_000,
      sendReasoning: false,
      onError: () =>
        "The AI editor couldn't finish. Your draft is safe. Try again.",
    });
  } catch (error) {
    return jsonError(error);
  }
}
