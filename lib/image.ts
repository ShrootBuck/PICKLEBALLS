import "server-only";

import sharp from "sharp";

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
    throw new Error("Image must be between 1 byte and 6 MB.");
  }
  if (!allowedMimeTypes.has(file.type.toLowerCase())) {
    throw new Error("Use a PNG, JPEG, WebP, or HEIC image.");
  }

  const input = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(input, {
    failOn: "error",
    limitInputPixels: 40_000_000,
  }).metadata();
  if (!metadata.format || !allowedFormats.has(metadata.format)) {
    throw new Error("Use a real PNG, JPEG, WebP, or HEIC image.");
  }

  const data = await sharp(input, {
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
    .toBuffer();
  const output = await sharp(data).metadata();
  if (!output.width || !output.height)
    throw new Error("Could not decode image.");

  return {
    data: new Uint8Array(data),
    mimeType: "image/webp",
    sizeBytes: data.byteLength,
    width: output.width,
    height: output.height,
  };
}
