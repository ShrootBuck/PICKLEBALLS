import { maxMediaCount, uploadTicketSchema } from "@/lib/media-policy";
import { prepareProofPhoto } from "@/lib/proof-upload";

export async function uploadMedia(
  files: File[],
  onProgress?: (message: string) => void,
) {
  if (!files.length || files.length > maxMediaCount)
    throw new Error("Choose one to six photos or videos.");
  const ids: string[] = [];
  for (const [index, source] of files.entries()) {
    onProgress?.(`Uploading ${index + 1} of ${files.length}…`);
    const file = source.type.startsWith("image/")
      ? await prepareProofPhoto(source)
      : source;
    const input = uploadTicketSchema.safeParse({
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (!input.success)
      throw new Error(
        "Use JPEG, PNG, WebP, HEIC, MP4, MOV, or WebM. Videos must be under 50 MB.",
      );
    const ticketResponse = await fetch("/api/media", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input.data),
    });
    const ticket = await ticketResponse.json();
    if (!ticketResponse.ok)
      throw new Error(ticket.error ?? "Could not start upload.");
    const uploaded = await fetch(ticket.url, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file,
    });
    if (!uploaded.ok) throw new Error("Upload failed. Try again.");
    const finalized = await fetch(`/api/media/${ticket.id}`, {
      method: "POST",
    });
    if (!finalized.ok) {
      const error = await finalized.json();
      throw new Error(error.error ?? "Could not verify upload.");
    }
    ids.push(ticket.id);
  }
  onProgress?.("Posting…");
  return ids;
}
