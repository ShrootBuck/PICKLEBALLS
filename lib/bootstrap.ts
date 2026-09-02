import "server-only";

import { getPrisma } from "@/lib/prisma";

export async function ensureBootstrapMembership(
  userId: string,
  knownDiscordId?: string | null,
) {
  const bootstrapDiscordId = process.env.BOOTSTRAP_DISCORD_USER_ID;
  if (!bootstrapDiscordId) return null;

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
      update: { name: "Pickle Balls" },
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
