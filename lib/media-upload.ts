import { holdAppRefresh } from "@/lib/app-refresh";
import {
  maxMediaCount,
  mediaMimeType,
  uploadTicketSchema,
} from "@/lib/media-policy";
import { prepareProofPhoto } from "@/lib/proof-upload";

type UploadState = {
  id: string;
  url?: string;
  partSize?: number;
  parts: Set<number>;
  file: File;
  finalized: boolean;
};
// A retry in this tab reuses completed chunks, including when the composer closes and reopens.
const uploads = new WeakMap<File, UploadState>();

async function jsonRequest(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Upload failed. Try again.");
  return data;
}
function putChunk(
  url: string,
  blob: Blob,
  mimeType: string | null,
  progress: (loaded: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.timeout = 15 * 60_000;
    if (mimeType) xhr.setRequestHeader("content-type", mimeType);
    xhr.upload.onprogress = (event) => progress(event.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error("Upload failed. Retry to resume completed chunks."));
    xhr.onerror = xhr.ontimeout = () =>
      reject(new Error("Connection lost. Retry to resume completed chunks."));
    xhr.send(blob);
  });
}
async function waitForMedia(id: string, status?: (message: string) => void) {
  for (;;) {
    const response = await fetch(
      `/api/media/status?id=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (!response.ok)
      throw new Error("Could not check video processing. Try again.");
    const media = (await response.json()).media?.[0];
    if (!media) throw new Error("Upload no longer available.");
    if (media.ready) return;
    if (media.processingError) throw new Error(media.processingError);
    status?.(`Processing video: ${media.progress}%`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

export async function uploadMedia(
  files: File[],
  onProgress?: (message: string) => void,
  options?: { deferProcessing?: boolean },
) {
  const release = holdAppRefresh();
  const warn = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = "";
  };
  window.addEventListener("beforeunload", warn);
  try {
    if (!files.length || files.length > maxMediaCount)
      throw new Error("Choose one to six photos or videos.");
    const ids: string[] = [];
    for (const [index, source] of files.entries()) {
      let state = uploads.get(source);
      if (!state) {
        onProgress?.(`Preparing ${index + 1} of ${files.length}…`);
        const file = source.type.startsWith("image/")
          ? await prepareProofPhoto(source)
          : source;
        const mimeType = mediaMimeType(file);
        const input = uploadTicketSchema.safeParse({
          mimeType,
          sizeBytes: file.size,
        });
        if (!input.success)
          throw new Error(
            "Use a supported photo up to 100 MB or video up to 5 GB.",
          );
        const ticket = await jsonRequest("/api/media", "POST", input.data);
        state = { ...ticket, file, parts: new Set(), finalized: false };
        uploads.set(source, state as UploadState);
      }
      const current = state as UploadState;
      if (!current.finalized) {
        if (current.partSize) {
          const partSize = current.partSize;
          for (
            let part = 1;
            part <= Math.ceil(current.file.size / partSize);
            part++
          ) {
            if (current.parts.has(part)) continue;
            const start = (part - 1) * partSize;
            const chunk = current.file.slice(
              start,
              Math.min(start + partSize, current.file.size),
            );
            for (let attempt = 0; ; attempt++) {
              try {
                const { url } = await jsonRequest(
                  `/api/media/${current.id}`,
                  "PATCH",
                  { part },
                );
                await putChunk(url, chunk, null, (loaded) =>
                  onProgress?.(
                    `Uploading ${index + 1} of ${files.length}: ${Math.min(100, Math.floor(((start + loaded) / current.file.size) * 100))}%`,
                  ),
                );
                current.parts.add(part);
                break;
              } catch (error) {
                if (attempt >= 2) throw error;
                await new Promise((resolve) =>
                  setTimeout(resolve, 1000 * 2 ** attempt),
                );
              }
            }
          }
        } else {
          await putChunk(
            current.url as string,
            current.file,
            current.file.type,
            (loaded) =>
              onProgress?.(
                `Uploading ${index + 1} of ${files.length}: ${Math.floor((loaded / current.file.size) * 100)}%`,
              ),
          );
        }
        await jsonRequest(`/api/media/${current.id}`, "POST");
        current.finalized = true;
      }
      if (
        current.finalized &&
        current.id.startsWith("v_") &&
        !options?.deferProcessing
      )
        await jsonRequest(`/api/media/${current.id}`, "POST");
      ids.push(current.id);
    }
    window.removeEventListener("beforeunload", warn);
    if (!options?.deferProcessing)
      for (const id of ids.filter((id) => id.startsWith("v_")))
        await waitForMedia(id, onProgress);
    onProgress?.("Posting…");
    return ids;
  } finally {
    window.removeEventListener("beforeunload", warn);
    release();
  }
}
