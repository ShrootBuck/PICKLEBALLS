import "server-only";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { discordAvatarUrl } from "@/lib/avatar-url";
import { getPrisma } from "@/lib/prisma";
import { limitAction } from "@/lib/rate-limit";

const profileSchema = z.object({
  id: z.string().regex(/^\d+$/),
  avatar: z
    .string()
    .regex(/^(?:a_)?[a-f0-9]+$/)
    .nullable(),
  discriminator: z.string().regex(/^\d{1,4}$/),
});

type AvatarUser = {
  id: string;
  image: string | null;
  accounts: { id: string; accountId: string }[];
};

const inFlight = new Map<string, Promise<string | null>>();

async function refresh(user: AvatarUser) {
  const previous = discordAvatarUrl(user.image);
  const account = user.accounts[0];
  if (!account) return previous;
  try {
    // Database-backed reservation also prevents duplicate token refreshes across
    // web instances. Failed/revoked grants back off instead of retrying per image.
    await limitAction(user.id, "discord-avatar-refresh", 1, 5 * 60_000);
    // Server-only call: select the target's account, never the viewer's cookies.
    // Better Auth decrypts tokens and persists rotated tokens on expiry.
    const { accessToken } = await auth.api.getAccessToken({
      body: { userId: user.id, accountId: account.id },
    });
    if (!accessToken) return previous;
    const response = await fetch("https://discord.com/api/users/@me", {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return previous;
    const parsed = profileSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.id !== account.accountId)
      return previous;
    const { id, avatar, discriminator } = parsed.data;
    const defaultIndex =
      discriminator === "0"
        ? Number((BigInt(id) >> BigInt(22)) % BigInt(6))
        : Number(discriminator) % 5;
    const image = discordAvatarUrl(
      avatar
        ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.${avatar.startsWith("a_") ? "gif" : "png"}`
        : `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`,
    );
    if (image && image !== previous) {
      // Don't overwrite a newer sign-in's image if it raced this request.
      const result = await getPrisma().user.updateMany({
        where: { id: user.id, image: user.image },
        data: { image },
      });
      if (!result.count) {
        const latest = await getPrisma().user.findUnique({
          where: { id: user.id },
          select: { image: true },
        });
        return discordAvatarUrl(latest?.image);
      }
    }
    return image ?? previous;
  } catch {
    // An unavailable provider must not erase a working picture or break a page.
    // Do not log OAuth errors, which can include credentials/provider responses.
    return previous;
  }
}

export async function refreshDiscordAvatar(user: AvatarUser) {
  const pending = inFlight.get(user.id);
  if (pending) return pending;
  const result = refresh(user);
  inFlight.set(user.id, result);
  try {
    return await result;
  } finally {
    inFlight.delete(user.id);
  }
}
