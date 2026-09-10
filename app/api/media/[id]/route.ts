import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { jsonError, readJson } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { sanitizeImage } from "@/lib/image";
import { startMediaProcessing } from "@/lib/media-dispatch";
import { completeMediaUpload, signMediaPart } from "@/lib/media-multipart";
import { uploadLifetimeMs } from "@/lib/media-policy";
import { getPrisma } from "@/lib/prisma";
import {
  immutableImageResponse,
  mediaDownloadUrl,
  putMedia,
  r2,
} from "@/lib/r2";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { readBoundedBody } from "@/lib/request-body";

export const runtime = "nodejs";
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "media-finalize", 60, 600_000);
    const { id } = await context.params;
    const ticket = await getPrisma().mediaUpload.findFirst({
      where: {
        id,
        ownerId: auth.session.user.id,
        circleId: auth.membership.circleId,
      },
    });
    if (!ticket) throw new DomainError("Upload not found.", 404);
    if (ticket.ready) return Response.json({ id, ready: true });
    if (ticket.uploadedAt && ticket.mimeType.startsWith("video/")) {
      if (ticket.processingError && !ticket.pendingProofId)
        await getPrisma().mediaUpload.updateMany({
          where: { id, processingError: { not: null }, pendingProofId: null },
          data: {
            processingError: null,
            encodeAttempt: { increment: 1 },
            progress: 0,
          },
        });
      await startMediaProcessing(id);
      return Response.json({ id, ready: false }, { status: 202 });
    }
    if (Date.now() - ticket.createdAt.getTime() > uploadLifetimeMs)
      throw new DomainError("Upload expired. Choose the file again.");
    if (ticket.mimeType.startsWith("video/")) {
      await completeMediaUpload(ticket);
      await getPrisma().mediaUpload.updateMany({
        where: { id, uploadedAt: null },
        data: { uploadedAt: new Date() },
      });
      await startMediaProcessing(id);
      return Response.json({ id, ready: false }, { status: 202 });
    }
    const { client, bucket } = r2();
    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: ticket.objectKey }),
    );
    if (!object.Body || BigInt(object.ContentLength ?? -1) !== ticket.sizeBytes)
      throw new DomainError("Incomplete upload. Choose the file again.");
    const bytes = await readBoundedBody(
      new Request("http://media.local", {
        method: "POST",
        body: object.Body.transformToWebStream(),
        duplex: "half",
      } as RequestInit),
      Number(ticket.sizeBytes),
    );
    if (BigInt(bytes.length) !== ticket.sizeBytes)
      throw new DomainError("Incomplete upload.");
    let data = bytes;
    let mimeType = ticket.mimeType;
    if (mimeType.startsWith("image/")) {
      const image = await sanitizeImage(
        new File([bytes], "upload", { type: mimeType }),
      );
      data = image.data;
      mimeType = image.mimeType;
    }
    // Never serve the writable staging key. A fresh immutable key also makes concurrent finalization safe.
    const key = `media/${id}/${randomUUID()}`;
    await putMedia(key, data, mimeType);
    await getPrisma().mediaUpload.updateMany({
      where: { id, ready: false },
      data: { ready: true, objectKey: key, mimeType, sizeBytes: data.length },
    });
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: ticket.objectKey }),
    );
    return Response.json({ id, ready: true });
  } catch (error) {
    return jsonError(error);
  }
}
export async function GET(request: Request, context: Context) {
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Not found." }, { status: 404 });
  try {
    const { id } = await context.params;
    const circleId = auth.membership.circleId;
    const media = await getPrisma().mediaUpload.findFirst({
      where: { id, circleId, ready: true },
    });
    const [proof, reply, screenTime] = media
      ? await Promise.all([
          getPrisma().taskProof.findFirst({
            where: { circleId, mediaIds: { has: id } },
            select: { id: true },
          }),
          getPrisma().socialReply.findFirst({
            where: { circleId, mediaIds: { has: id } },
            select: { id: true },
          }),
          getPrisma().screenTimeReading.findFirst({
            where: {
              mediaId: id,
              circleId,
              OR: [
                { userId: auth.session.user.id },
                { submission: { isNot: null } },
              ],
            },
            select: { id: true },
          }),
        ])
      : [null, null, null];
    if (!media || (!proof && !reply && !screenTime))
      return Response.json({ error: "Not found." }, { status: 404 });
    if (new URL(request.url).searchParams.get("playback") === "1") {
      return Response.json(
        {
          url: await mediaDownloadUrl(media.objectKey, media.mimeType),
          duration: media.duration,
          poster: media.posterKey ? `/api/media/${id}?poster=1` : null,
        },
        { headers: { "cache-control": "private, no-store" } },
      );
    }
    if (new URL(request.url).searchParams.get("poster") === "1") {
      if (!media.posterKey)
        return Response.json({ error: "No poster." }, { status: 404 });
      return immutableImageResponse(media.posterKey, "image/webp");
    }
    if (media.mimeType.startsWith("image/"))
      return await immutableImageResponse(media.objectKey, media.mimeType);
    return new Response(null, {
      status: 307,
      headers: {
        location: await mediaDownloadUrl(media.objectKey, media.mimeType),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const { id } = await context.params;
    const media = await getPrisma().mediaUpload.findFirst({
      where: {
        id,
        ownerId: auth.session.user.id,
        circleId: auth.membership.circleId,
      },
    });
    if (!media) throw new DomainError("Upload not found.", 404);
    const input = (await readJson(request)) as { part?: number };
    const url = await signMediaPart(media, Number(input?.part));
    return Response.json({ url });
  } catch (error) {
    return jsonError(error);
  }
}
