import { afterEach, expect, test } from "bun:test";
import { maxPhotoBytes, uploadTicketSchema } from "@/lib/media-policy";
import { prepareProofPhoto } from "@/lib/proof-upload";

const originalBitmap = Object.getOwnPropertyDescriptor(
  globalThis,
  "createImageBitmap",
);
const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);
afterEach(() => {
  for (const [key, descriptor] of [
    ["createImageBitmap", originalBitmap],
    ["document", originalDocument],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test("full-size camera JPEG uploads unchanged without canvas", async () => {
  const file = new File([new Uint8Array(25 * 1024 * 1024)], "IMG_1234.JPG", {
    type: "image/jpeg",
  });
  expect(await prepareProofPhoto(file)).toBe(file);
  expect(
    uploadTicketSchema.safeParse({ mimeType: file.type, sizeBytes: file.size })
      .success,
  ).toBe(true);
});

test("HEIC decoder failure uploads the original above the old limit", async () => {
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async () => {
      throw new Error("Unsupported codec");
    },
  });
  const file = new File([new Uint8Array(8 * 1024 * 1024)], "IMG.HEIC", {
    type: "image/heic",
  });
  expect(await prepareProofPhoto(file)).toBe(file);
});

test("a canvas result above 4 MB no longer rejects the photo", async () => {
  let closed = false;
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async () => ({
      width: 8064,
      height: 6048,
      close: () => {
        closed = true;
      },
    }),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => ({
        getContext: () => ({ drawImage: () => {} }),
        toBlob: (callback: (blob: Blob) => void) =>
          callback(
            new Blob([new Uint8Array(5 * 1024 * 1024)], { type: "image/jpeg" }),
          ),
      }),
    },
  });
  const file = new File(["heic"], "IMG.HEIC", { type: "image/heic" });
  const prepared = await prepareProofPhoto(file);
  expect(prepared.size).toBe(5 * 1024 * 1024);
  expect(prepared.type).toBe("image/jpeg");
  expect(closed).toBe(true);
});

test("photo size boundary is shared by the upload service", () => {
  for (const mimeType of ["image/jpeg", "image/heic", "image/png"]) {
    expect(
      uploadTicketSchema.safeParse({ mimeType, sizeBytes: maxPhotoBytes })
        .success,
    ).toBe(true);
    expect(
      uploadTicketSchema.safeParse({ mimeType, sizeBytes: maxPhotoBytes + 1 })
        .success,
    ).toBe(false);
  }
});
