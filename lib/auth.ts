import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import {
  APIError,
  addOAuthServerContext,
  createAuthMiddleware,
  getOAuthState,
} from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { ensureBootstrapMembership } from "@/lib/bootstrap";
import { ACTIVE_CIRCLE_COOKIE } from "@/lib/circle-cookie";
import {
  findReservedInvite,
  redeemReservedInvite,
  reserveInvite,
} from "@/lib/invites";
import { getInitials as initials } from "@/lib/names";
import { getPrisma } from "@/lib/prisma";

function oauthClaim(state: Awaited<ReturnType<typeof getOAuthState>>) {
  const context = state?.serverContext;
  if (
    typeof context?.inviteId !== "string" ||
    typeof context?.claimNonce !== "string"
  ) {
    return null;
  }
  return { inviteId: context.inviteId, claimNonce: context.claimNonce };
}

const configuredOrigins = [
  ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000"]),
  process.env.BETTER_AUTH_URL,
  process.env.NEXT_PUBLIC_APP_URL,
].filter((value): value is string => Boolean(value));

export const auth = betterAuth({
  appName: "Pickle Balls",
  database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
  trustedOrigins: [...new Set(configuredOrigins)],
  socialProviders: {
    discord: {
      clientId:
        process.env.DISCORD_CLIENT_ID ??
        (process.env.NODE_ENV === "production"
          ? (() => {
              throw new Error("DISCORD_CLIENT_ID is not configured");
            })()
          : "discord-client-not-configured"),
      clientSecret:
        process.env.DISCORD_CLIENT_SECRET ??
        (process.env.NODE_ENV === "production"
          ? (() => {
              throw new Error("DISCORD_CLIENT_SECRET is not configured");
            })()
          : "discord-secret-not-configured"),
      disableImplicitSignUp: true,
      overrideUserInfoOnSignIn: true,
      mapProfileToUser: (profile) => ({
        discordId: profile.id,
        discordUsername: profile.username,
        email: profile.email ?? `${profile.id}@discord.placeholder.invalid`,
        emailVerified: profile.verified || profile.email == null,
        name: profile.global_name || profile.username,
        image: profile.image_url,
        initials: initials(profile.global_name || profile.username),
      }),
    },
  },
  emailAndPassword: { enabled: false },
  disabledPaths: [
    "/sign-up/email",
    "/sign-in/email",
    "/request-password-reset",
    "/reset-password",
    "/send-verification-email",
    "/verify-email",
  ],
  user: {
    additionalFields: {
      initials: {
        type: "string",
        required: false,
        defaultValue: "PB",
        input: false,
      },
      discordId: { type: "string", required: false, input: false },
      discordUsername: { type: "string", required: false, input: false },
    },
    validateUserInfo: async ({ source }) => {
      if (source.action !== "create-user") return;
      if (source.oauth?.providerId !== "discord") {
        return { error: "discord_only" };
      }

      const discordId = source.oauth.profile?.id;
      if (
        typeof discordId === "string" &&
        process.env.BOOTSTRAP_DISCORD_USER_ID === discordId
      ) {
        return;
      }

      // Open registration: any Discord user may sign up. An invite is only
      // needed to join somebody else's circle; creating your own happens
      // on /circles after sign-in.
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/social") return;
      const body = ctx.body as
        | {
            provider?: string;
            additionalData?: { inviteToken?: unknown };
          }
        | undefined;
      if (body?.provider !== "discord") return;

      const token = body.additionalData?.inviteToken;
      if (typeof token !== "string" || token.length === 0) return;
      const reservation = await reserveInvite(token);
      if (!reservation) {
        throw new APIError("FORBIDDEN", {
          message: "That invite is expired, used, or already claimed.",
        });
      }
      await addOAuthServerContext({
        inviteId: reservation.inviteId,
        claimNonce: reservation.claimNonce,
      });
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/callback/discord" || !ctx.context.newSession) return;
      const claim = oauthClaim(await getOAuthState());
      if (!claim) return;
      const invite = await findReservedInvite(claim.inviteId, claim.claimNonce);
      if (!invite) throw ctx.redirect("/circles?invite=expired");
      const userId = ctx.context.newSession.user.id;
      const existing = await getPrisma().membership.findUnique({
        where: { userId_circleId: { userId, circleId: invite.circleId } },
      });
      if (existing) {
        await getPrisma().invite.updateMany({
          where: { id: invite.id, claimNonce: claim.claimNonce, usedAt: null },
          data: { claimNonce: null, claimExpiresAt: null },
        });
      } else {
        await redeemReservedInvite(claim.inviteId, claim.claimNonce, userId);
      }
      ctx.setCookie(ACTIVE_CIRCLE_COOKIE, invite.circleId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      });
    }),
  },
  databaseHooks: {
    user: {
      update: {
        before: async (userData) => {
          // Invite labels own the display name. Discord re-logins may
          // refresh the avatar and handle, but must not clobber the label.
          // (Prisma skips `undefined` fields, so this preserves name/initials.)
          if (typeof userData.name === "string") {
            return {
              data: { ...userData, name: undefined, initials: undefined },
            };
          }
        },
      },
      create: {
        before: async (user) => ({
          data: { ...user, initials: initials(user.name) },
        }),
        after: async (user) => {
          const discordId =
            typeof user.discordId === "string" ? user.discordId : null;
          await ensureBootstrapMembership(user.id, discordId);
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5, strategy: "jwe" },
  },
  account: {
    encryptOAuthTokens: true,
    storeStateStrategy: "database",
    accountLinking: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/social": { window: 60, max: 8 },
      "/callback/discord": { window: 60, max: 12 },
    },
  },
  advanced: {
    database: { joins: true },
    cookiePrefix: "pickle-balls",
    useSecureCookies: process.env.NODE_ENV === "production",
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      disableIpTracking: false,
    },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
