import "server-only";

import { NextResponse } from "next/server";
import { DomainError } from "@/lib/tasks";

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
