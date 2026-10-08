import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

// A retry re-reads the state after a competing upload, edit, or verdict.
// Callbacks must contain database work only; send notifications after commit.
export async function serializable<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getPrisma().$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034"
      )
        throw error;
      if (attempt >= 2)
        throw new DomainError(
          "Someone just updated this. Refresh and try again.",
          409,
        );
    }
  }
}
