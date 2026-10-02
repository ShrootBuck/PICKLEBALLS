import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/request";

export const SUPER_ADMIN_DISCORD_ID = "1104218586039455774";

// The Discord account link is authoritative; User.discordId can be null for
// accounts created before that column was populated.
export const isSuperAdmin = cache(async (userId: string) => {
  const match = await getPrisma().user.findFirst({
    where: {
      id: userId,
      OR: [
        { discordId: SUPER_ADMIN_DISCORD_ID },
        {
          accounts: {
            some: { providerId: "discord", accountId: SUPER_ADMIN_DISCORD_ID },
          },
        },
      ],
    },
    select: { id: true },
  });
  return match !== null;
});

// Responds with 404 so the console's existence is not revealed to others.
export async function requireSuperAdmin() {
  const { session } = await requireSession();
  if (!(await isSuperAdmin(session.user.id))) notFound();
  return { session };
}
