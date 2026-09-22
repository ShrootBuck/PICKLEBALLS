import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { jsonError, readJson } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { r2 } from "@/lib/r2";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { attachmentPart, chatUploadSchema } from "@/lib/timeblock-chat";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const input = chatUploadSchema.safeParse(await readJson(request));
    if (!input.success)
      throw new DomainError(
        "Choose a supported file up to 100 MB (text files up to 1 MB).",
      );
    const db = getPrisma();
    const chat = await db.timeblockChat.findFirst({
      where: { id: input.data.chatId, userId: auth.session.user.id },
    });
    if (!chat)
      throw new DomainError(
        "Reload the conversation before attaching files.",
        409,
      );
    await limitAction(chat.userId, "timeblock-chat-upload", 60, 3_600_000);
    const id = crypto.randomUUID();
    const objectKey = `timeblock-chat/${chat.id}/${id}`;
    const { client, bucket } = r2();
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        ContentType: input.data.mediaType,
        ContentLength: input.data.sizeBytes,
      }),
      { expiresIn: 600 },
    );
    const file = await db.timeblockChatAttachment.create({
      data: { id, ...input.data, objectKey },
    });
    return Response.json({ uploadUrl, part: attachmentPart(file) });
  } catch (error) {
    return jsonError(error);
  }
}
