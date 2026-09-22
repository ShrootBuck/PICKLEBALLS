import {
  createAgentUIStream,
  createUIMessageStreamResponse,
  readUIMessageStream,
} from "ai";
import { after } from "next/server";
import { z } from "zod";
import { model } from "@/lib/ai";
import { aiHourlyLimit } from "@/lib/ai-config";
import { jsonError, readJson } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import {
  createTimeblockAgent,
  type TimeblockAgentMessage,
} from "@/lib/timeblock-agent";
import { chatUserMessageSchema } from "@/lib/timeblock-chat";
import {
  chatJson,
  chatSnapshot,
  deleteChatObjects,
  loadTimeblockChat,
  resolveChatFiles,
} from "@/lib/timeblock-chat-store";
import { timeblockDraftSchema } from "@/lib/timeblock-draft";
import { timeblockRoutineSchema } from "@/lib/timeblock-routine";
import { isMondayDateKey } from "@/lib/timeblocks";

export const runtime = "nodejs";
export const maxDuration = 300;
const requestSchema = z.object({
  id: z.string().min(1).max(100),
  revision: z.number().int().nonnegative(),
  routine: timeblockRoutineSchema,
  dueMonday: z.string().refine(isMondayDateKey),
  rows: timeblockDraftSchema.shape.rows.refine(
    (rows) => new Set(rows.map((r) => r.id)).size === rows.length,
  ),
  message: chatUserMessageSchema,
  trigger: z
    .enum(["submit-message", "regenerate-message"])
    .default("submit-message"),
});

export async function GET(request: Request) {
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    return Response.json(
      chatSnapshot(await loadTimeblockChat(auth.session.user.id)),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

// Stop and reset invalidate the run token before replying. Late stream writes
// cannot resurrect a cleared conversation or apply more stopped edits.
export async function PATCH(request: Request) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const input = z
      .object({ id: z.string(), action: z.enum(["stop", "reset"]) })
      .parse(await readJson(request));
    const db = getPrisma();
    const chat = await db.timeblockChat.findFirst({
      where: { id: input.id, userId: auth.session.user.id },
    });
    if (!chat)
      throw new DomainError(
        "This chat changed in another tab. Reload it.",
        409,
      );
    if (input.action === "stop") {
      await db.timeblockChat.updateMany({
        where: { id: chat.id, userId: chat.userId },
        data: { runId: null, runExpiresAt: null },
      });
      return Response.json(chatSnapshot(await loadTimeblockChat(chat.userId)));
    }
    const keys = await db.timeblockChatAttachment.findMany({
      where: { chatId: chat.id },
      select: { objectKey: true },
    });
    const next = await db.$transaction(async (tx) => {
      await tx.timeblockChat.delete({ where: { id: chat.id } });
      return tx.timeblockChat.create({ data: { userId: chat.userId } });
    });
    after(() =>
      deleteChatObjects(keys.map((file) => file.objectKey)).catch((error) =>
        console.error("Chat file cleanup failed", error),
      ),
    );
    return Response.json(chatSnapshot(next));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  const db = getPrisma();
  let ownedRun: { id: string; runId: string } | undefined;
  try {
    const parsed = requestSchema.safeParse(await readJson(request));
    if (!parsed.success)
      throw new DomainError("Send a message with a valid timeblock draft.");
    const input = parsed.data;
    if (!process.env.OPENROUTER_API_KEY)
      throw new DomainError(
        "The AI editor is not configured yet. You can still edit blocks manually.",
        503,
      );
    const chat = await loadTimeblockChat(auth.session.user.id);
    if (chat.id !== input.id || chat.revision !== input.revision || chat.runId)
      throw new DomainError(
        "Your conversation changed or is still responding. Reload the chat and try again.",
        409,
      );
    const previous = chatSnapshot(chat).messages;
    const retryIndex = previous.findLastIndex((m) => m.role === "user");
    const retry = input.trigger === "regenerate-message";
    if (
      retry &&
      (retryIndex < 0 || previous[retryIndex].id !== input.message.id)
    )
      throw new DomainError("Reload the chat before retrying.", 409);
    if (!retry && previous.some((m) => m.id === input.message.id))
      throw new DomainError(
        "This message was already sent. Reload the chat.",
        409,
      );
    await limitAction(auth.session.user.id, "ai", aiHourlyLimit, 3_600_000);
    const messages: TimeblockAgentMessage[] = retry
      ? previous.slice(0, retryIndex + 1)
      : [...previous, input.message];
    const resolved = await resolveChatFiles(chat.id, messages);
    const runId = crypto.randomUUID();
    const claimed = await db.timeblockChat.updateMany({
      where: {
        id: chat.id,
        userId: chat.userId,
        revision: input.revision,
        runId: null,
      },
      data: {
        messages: chatJson(messages),
        revision: { increment: 1 },
        runId,
        runExpiresAt: new Date(Date.now() + 300_000),
        error: null,
      },
    });
    if (!claimed.count)
      throw new DomainError(
        "Another response just started. Reload the chat.",
        409,
      );
    ownedRun = { id: chat.id, runId };
    const controller = new AbortController();
    let streamError: string | null = null;
    const stream = await createAgentUIStream({
      agent: createTimeblockAgent(
        model(chat.userId),
        input.dueMonday,
        input.rows,
        input.routine,
        `pb-timeblock:${chat.userId}:${auth.membership.circleId}:${input.dueMonday}`,
      ),
      uiMessages: resolved,
      originalMessages: messages,
      abortSignal: controller.signal,
      timeout: 285_000,
      sendReasoning: true,
      sendSources: true,
      generateMessageId: () => crypto.randomUUID(),
      onError: () => {
        streamError =
          "The AI couldn't finish. Your conversation and completed edits are saved. Try again.";
        return streamError;
      },
    });
    const [clientStream, persistenceStream] = stream.tee();
    // Consume independently of the browser. Checkpoint the SDK's complete
    // message format, including files and tools, so reconnects can poll it.
    const persist = async () => {
      let latest: TimeblockAgentMessage | undefined;
      let savedAt = 0;
      let savedTools = "";
      const heartbeat = setInterval(async () => {
        try {
          const active = await db.timeblockChat.count({
            where: { id: chat.id, runId },
          });
          if (!active) controller.abort();
        } catch {
          controller.abort();
        }
      }, 2000);
      try {
        for await (const message of readUIMessageStream<TimeblockAgentMessage>({
          stream: persistenceStream,
          onError: () => {
            streamError = "The response was interrupted. Try again.";
          },
        })) {
          latest = message;
          const completedTools = message.parts
            .filter(
              (part) =>
                "toolCallId" in part &&
                (part.state === "output-available" ||
                  part.state === "output-error"),
            )
            .map((part) => ("toolCallId" in part ? part.toolCallId : ""))
            .join(",");
          if (Date.now() - savedAt < 1000 && completedTools === savedTools)
            continue;
          savedTools = completedTools;
          const saved = await db.timeblockChat.updateMany({
            where: { id: chat.id, runId },
            data: { messages: chatJson([...messages, message]) },
          });
          savedAt = Date.now();
          if (!saved.count) {
            controller.abort();
            break;
          }
        }
      } catch {
        streamError =
          "The response was interrupted. Your saved conversation is safe. Try again.";
        controller.abort();
      } finally {
        clearInterval(heartbeat);
        await db.timeblockChat.updateMany({
          where: { id: chat.id, runId },
          data: {
            ...(latest ? { messages: chatJson([...messages, latest]) } : {}),
            runId: null,
            runExpiresAt: null,
            error: streamError,
          },
        });
      }
    };
    const completion = persist();
    after(() => completion);
    return createUIMessageStreamResponse({ stream: clientStream });
  } catch (error) {
    if (ownedRun)
      await db.timeblockChat.updateMany({
        where: ownedRun,
        data: {
          runId: null,
          runExpiresAt: null,
          error: "Couldn't start the response. Try again.",
        },
      });
    return jsonError(error);
  }
}
