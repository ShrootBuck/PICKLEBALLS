export const maxPhotoBytes = 20 * 1024 * 1024;
export const maxPreparedPhotoBytes = 4 * 1024 * 1024;

export async function prepareProofPhoto(file: File): Promise<File> {
  if (file.size > maxPhotoBytes) throw new Error("Choose a photo under 20 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Some browsers cannot decode HEIC; the server may be able to.
    if (file.size <= maxPreparedPhotoBytes) return file;
    throw new Error(
      "This browser cannot resize that photo. Export it as JPEG or choose a smaller image.",
    );
  }
  try {
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Could not prepare the photo. Try another browser.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.86),
    );
    if (!blob || blob.size > maxPreparedPhotoBytes)
      throw new Error("The photo is still too large. Choose a smaller image.");
    return new File([blob], "proof.webp", { type: blob.type });
  } finally {
    bitmap.close();
  }
}
