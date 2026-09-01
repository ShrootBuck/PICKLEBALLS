import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { getPrisma } from "@/lib/prisma";

export const internalSignupHeader = "x-pickle-balls-internal-signup";

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.NEXT_PUBLIC_APP_URL,
].filter((origin): origin is string => Boolean(origin));

export const auth = betterAuth({
  appName: "Pickle Balls",
  database: prismaAdapter(getPrisma(), {
    provider: "postgresql",
  }),
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  disabledPaths: [
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
      avatarColor: {
        type: "string",
        required: false,
        defaultValue: "lime",
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            initials: getInitials(user.name) || "PB",
            avatarColor: "lime",
          },
        }),
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      const internalSecret = ctx.headers?.get(internalSignupHeader);
      if (
        !process.env.BETTER_AUTH_SECRET ||
        internalSecret !== process.env.BETTER_AUTH_SECRET
      ) {
        throw new APIError("FORBIDDEN", {
          message: "You need a valid squad invite to sign up.",
        });
      }
    }),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
      strategy: "compact",
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
    },
  },
  advanced: {
    database: {
      joins: true,
    },
    cookiePrefix: "pickle-balls",
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
