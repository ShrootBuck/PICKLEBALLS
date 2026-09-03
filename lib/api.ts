import "server-only";

import { NextResponse } from "next/server";
import { DomainError } from "@/lib/errors";

export function jsonError(error: unknown) {
  if (error instanceof DomainError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  console.error("Request failed", error);
  return NextResponse.json(
    { error: "The server dropped the ball. Try again." },
    { status: 500 },
  );
}

// Guard against giant JSON bodies allocating before Zod ever sees them.
export const maxJsonBytes = 1024 * 1024;

export async function readJson(request: Request, maxBytes = maxJsonBytes) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new DomainError("Payload too large.", 413);
  }
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new DomainError("Payload too large.", 413);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SyntaxError("Invalid JSON.");
  }
}
