import { maxPhotoBytes } from "@/lib/media-policy";

export async function prepareProofPhoto(file: File): Promise<File> {
  if (file.size > maxPhotoBytes)
    throw new Error("Choose a photo up to 100 MB.");
  // Upload ordinary photos unchanged directly to object storage. Browser canvas
  // encoding must never impose a smaller limit than the upload service.
  if (!["image/heic", "image/heif"].includes(file.type)) return file;

  // Convert HEIC when the browser can decode it, for server codec compatibility.
  // JPEG is supported by Safari's canvas encoder; WebP can silently become PNG.
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob || blob.size === 0 || blob.size > maxPhotoBytes) return file;
    return new File([blob], "proof.jpg", { type: blob.type });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
