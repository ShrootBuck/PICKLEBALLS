import "dotenv/config";

import { getPrisma } from "@/lib/prisma";
import { pruneExpiredAppData } from "@/lib/rolling-retention";

try {
  const result = await pruneExpiredAppData();
  console.log(JSON.stringify(result, null, 2));
} finally {
  await getPrisma().$disconnect();
}
