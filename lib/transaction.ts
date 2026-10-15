import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

function isWriteConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return error.code === "P2034";
  // Prisma's pg adapter can surface a conflict at COMMIT directly instead
  // of wrapping it as P2034. Only retry that specific adapter error.
  if (!(error instanceof Error) || error.name !== "DriverAdapterError")
    return false;
  const cause = error.cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "kind" in cause &&
    cause.kind === "TransactionWriteConflict"
  );
}

// A retry re-reads the state after a competing upload, edit, or verdict.
// Callbacks must contain database work only; send notifications after commit.
export async function serializable<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { timeout?: number } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getPrisma().$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        ...options,
      });
    } catch (error) {
      if (!isWriteConflict(error)) throw error;
      if (attempt >= 2)
        throw new DomainError(
          "Someone just updated this. Refresh and try again.",
          409,
        );
    }
  }
}
