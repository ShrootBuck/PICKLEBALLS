import { randomUUID } from "node:crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { jsonError } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { sanitizeImage } from "@/lib/image";
import { matchesVideo } from "@/lib/media-policy";
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
    if (ticket.ready) return Response.json({ id });
    if (Date.now() - ticket.createdAt.getTime() > 3600_000)
      throw new DomainError("Upload expired. Choose the file again.");
    const { client, bucket } = r2();
    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: ticket.objectKey }),
    );
    if (!object.Body || object.ContentLength !== ticket.sizeBytes)
      throw new DomainError("Incomplete upload. Choose the file again.");
    const bytes = await readBoundedBody(
      new Request("http://media.local", {
        method: "POST",
        body: object.Body.transformToWebStream(),
        duplex: "half",
      } as RequestInit),
      ticket.sizeBytes,
    );
    if (bytes.length !== ticket.sizeBytes)
      throw new DomainError("Incomplete upload.");
    let data = bytes;
    let mimeType = ticket.mimeType;
    if (mimeType.startsWith("image/")) {
      const image = await sanitizeImage(
        new File([bytes], "upload", { type: mimeType }),
      );
      data = image.data;
      mimeType = image.mimeType;
    } else if (!matchesVideo(bytes, mimeType))
      throw new DomainError("Use a real MP4, MOV, or WebM video.");
    // Never serve the writable staging key. A fresh immutable key also makes concurrent finalization safe.
    const key = `media/${id}/${randomUUID()}`;
    await putMedia(key, data, mimeType);
    await getPrisma().mediaUpload.updateMany({
      where: { id, ready: false },
      data: { ready: true, objectKey: key, mimeType, sizeBytes: data.length },
    });
    return Response.json({ id });
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
    const [proof, reply] = media
      ? await Promise.all([
          getPrisma().taskProof.findFirst({
            where: { circleId, mediaIds: { has: id } },
            select: { id: true },
          }),
          getPrisma().socialReply.findFirst({
            where: { circleId, mediaIds: { has: id } },
            select: { id: true },
          }),
        ])
      : [null, null];
    if (!media || (!proof && !reply))
      return Response.json({ error: "Not found." }, { status: 404 });
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
