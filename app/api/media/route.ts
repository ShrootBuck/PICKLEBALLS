import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { jsonError, readJson } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { uploadTicketSchema } from "@/lib/media-policy";
import { getPrisma } from "@/lib/prisma";
import { r2 } from "@/lib/r2";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "media-uploads", 30, 600_000);
    const parsed = uploadTicketSchema.safeParse(await readJson(request));
    if (!parsed.success)
      throw new DomainError(
        "Choose a supported photo or video within the size limit.",
      );
    const input = parsed.data;
    const { client, bucket } = r2();
    const id = `${input.mimeType.startsWith("video/") ? "v" : "i"}_${randomUUID()}`;
    const key = `staging/${id}`;
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: input.mimeType,
        ContentLength: input.sizeBytes,
      }),
      { expiresIn: 600 },
    );
    await getPrisma().mediaUpload.create({
      data: {
        id,
        ownerId: auth.session.user.id,
        circleId: auth.membership.circleId,
        ...input,
        objectKey: key,
      },
    });
    return Response.json({ id, url });
  } catch (error) {
    return jsonError(error);
  }
}
