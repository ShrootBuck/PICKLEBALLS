import "server-only";

import { randomUUID } from "node:crypto";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

// Atomic, bounded storage: one row per user/action, shared across serverless
// instances. Reserve before expensive work, not after it has finished.
export async function limitAction(
  userId: string,
  action: string,
  max: number,
  windowMs = 60_000,
) {
  const now = BigInt(Date.now());
  const since = now - BigInt(windowMs);
  const key = `app:${action}:${userId}`;
  const result = await getPrisma().$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
    VALUES (${randomUUID()}, ${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."lastRequest" <= ${since} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "lastRequest" = CASE WHEN "RateLimit"."lastRequest" <= ${since} THEN ${now} ELSE "RateLimit"."lastRequest" END
    WHERE "RateLimit"."lastRequest" <= ${since} OR "RateLimit"."count" < ${max}
    RETURNING "count"
  `;
  if (result.length === 0)
    throw new DomainError(
      "Too many requests. Give it a moment and try again.",
      429,
    );
}
