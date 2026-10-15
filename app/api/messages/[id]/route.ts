import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import {
  directMessageUser,
  privateMessageResponse,
} from "@/lib/direct-message-request";
import {
  directThread,
  readDirectMessages,
  sendDirectMessage,
} from "@/lib/direct-messages";
import { DomainError } from "@/lib/errors";
import { limitAction } from "@/lib/rate-limit";

type Context = { params: Promise<{ id: string }> };
const position = z.coerce.number().int().min(0).max(2147483647);

export async function GET(request: Request, context: Context) {
  try {
    const userId = await directMessageUser(request);
    const input = z
      .object({
        before: position.optional(),
        sinceRevision: position.optional(),
      })
      .refine((v) => v.before === undefined || v.sinceRevision === undefined)
      .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!input.success) throw new DomainError("Invalid message cursor.");
    return privateMessageResponse(
      await directThread(userId, (await context.params).id, input.data),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const userId = await directMessageUser(request);
    await limitAction(userId, "dm-send", 60, 60_000);
    const message = await sendDirectMessage(
      userId,
      (await context.params).id,
      await readJson(request),
    );
    return privateMessageResponse({ message }, 201);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const userId = await directMessageUser(request);
    const input = z
      .object({ through: position })
      .safeParse(await readJson(request));
    if (!input.success) throw new DomainError("Invalid message cursor.");
    return privateMessageResponse(
      await readDirectMessages(
        userId,
        (await context.params).id,
        input.data.through,
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
