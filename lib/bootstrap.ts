import "server-only";

import { getPrisma } from "@/lib/prisma";

export async function ensureBootstrapMembership(
  userId: string,
  knownDiscordId?: string | null,
) {
  const bootstrapDiscordId = process.env.BOOTSTRAP_DISCORD_USER_ID;
  if (!bootstrapDiscordId) return null;
  if (process.env.NODE_ENV !== "test") {
    console.warn(
      "[auth] BOOTSTRAP_DISCORD_USER_ID is set: that Discord account can always claim OWNER. Remove it once the first owner has signed in.",
    );
  }

  const prisma = getPrisma();
  const isBootstrapUser =
    knownDiscordId === bootstrapDiscordId ||
    Boolean(
      await prisma.account.findFirst({
        where: {
          userId,
          providerId: "discord",
          accountId: bootstrapDiscordId,
        },
        select: { id: true },
      }),
    );
  if (!isBootstrapUser) return null;

  return prisma.$transaction(async (transaction) => {
    const circle = await transaction.circle.upsert({
      where: { slug: "pickle-balls" },
      update: {},
      create: { slug: "pickle-balls", name: "Pickle Balls" },
    });
    await transaction.user.updateMany({
      where: { id: userId, discordId: null },
      data: { discordId: bootstrapDiscordId },
    });
    return transaction.membership.upsert({
      where: {
        userId_circleId: { userId, circleId: circle.id },
      },
      update: { role: "OWNER" },
      create: { userId, circleId: circle.id, role: "OWNER" },
      include: { circle: true, user: true },
    });
  });
}
