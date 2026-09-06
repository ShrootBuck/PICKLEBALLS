import { z } from "zod";

export const maxMediaCount = 6;
export const maxPhotoBytes = 100 * 1024 * 1024;
export const maxVideoBytes = 50 * 1024 * 1024;
export const mediaIdsSchema = z
  .array(z.string().regex(/^[iv]_[a-f0-9-]{36}$/))
  .max(maxMediaCount)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate attachments.");
export const uploadTicketSchema = z
  .object({
    mimeType: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ]),
    sizeBytes: z.number().int().positive(),
  })
  .refine(
    (v) =>
      v.sizeBytes <=
      (v.mimeType.startsWith("video/") ? maxVideoBytes : maxPhotoBytes),
    "Photo must be at most 100 MB; video must be at most 50 MB.",
  );

export function matchesVideo(data: Uint8Array, mimeType: string) {
  if (mimeType === "video/webm")
    return (
      data.length > 4 &&
      data[0] === 0x1a &&
      data[1] === 0x45 &&
      data[2] === 0xdf &&
      data[3] === 0xa3
    );
  return (
    data.length >= 12 && new TextDecoder().decode(data.slice(4, 8)) === "ftyp"
  );
}
