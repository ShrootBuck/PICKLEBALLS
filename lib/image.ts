import "server-only";

import sharp from "sharp";
import { DomainError } from "@/lib/errors";

const allowedFormats = new Set(["jpeg", "png", "webp", "heif"]);
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
export const maxUploadBytes = 6 * 1024 * 1024;

export async function sanitizeImage(file: File) {
  if (file.size <= 0 || file.size > maxUploadBytes) {
    throw new DomainError("Image must be between 1 byte and 6 MB.");
  }
  if (!allowedMimeTypes.has(file.type.toLowerCase())) {
    throw new DomainError("Use a PNG, JPEG, WebP, or HEIC image.");
  }

  const input = Buffer.from(await file.arrayBuffer());
  let metadata: { format?: string } | undefined;
  try {
    metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    }).metadata();
  } catch {
    throw new DomainError("Could not read that image. Try another file.");
  }
  if (!metadata.format || !allowedFormats.has(metadata.format)) {
    throw new DomainError("Use a real PNG, JPEG, WebP, or HEIC image.");
  }

  try {
    const { data, info } = await sharp(input, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 86, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height)
      throw new DomainError("Could not decode image.");

    return {
      data: new Uint8Array(data),
      mimeType: "image/webp",
      sizeBytes: data.byteLength,
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("Could not process that image. Try another file.");
  }
}
