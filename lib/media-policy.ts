import { z } from "zod";

export const maxMediaCount = 6;
export const maxPhotoBytes = 100 * 1024 * 1024;
export const maxVideoBytes = 5 * 1024 * 1024 * 1024;
export const mediaPartBytes = 8 * 1024 * 1024;
export const uploadLifetimeMs = 24 * 60 * 60 * 1000;
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
      "video/x-matroska",
      "video/x-msvideo",
      "video/x-m4v",
      "video/mpeg",
      "video/mp2t",
    ]),
    sizeBytes: z.number().int().positive(),
  })
  .refine(
    (v) =>
      v.sizeBytes <=
      (v.mimeType.startsWith("video/") ? maxVideoBytes : maxPhotoBytes),
    "Photo must be at most 100 MB; video must be at most 5 GB.",
  );

export function mediaMimeType(file: Pick<File, "name" | "type">) {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const types: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    m4v: "video/x-m4v",
    mpg: "video/mpeg",
    mpeg: "video/mpeg",
    ts: "video/mp2t",
  };
  return types[extension ?? ""] ?? file.type.toLowerCase();
}
