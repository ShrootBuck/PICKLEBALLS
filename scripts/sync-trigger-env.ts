import { envvars } from "@trigger.dev/sdk";

// Vercel's integration cannot export Sensitive variables, but the build has
// their real values. Transfer only the worker's dependencies, never auth secrets.
if (process.env.VERCEL_ENV === "production" && process.env.TRIGGER_SECRET_KEY) {
  const names = [
    "DATABASE_URL",
    "OPENROUTER_API_KEY",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
  ];
  const variables: Record<string, string> = {};
  for (const name of names) {
    const value = process.env[name];
    if (!value || /redacted/i.test(value)) {
      throw new Error(`Missing production worker variable: ${name}`);
    }
    variables[name] = value;
  }
  await envvars.upload("proj_xyssxtuhmwrlrkqotyxb", "prod", {
    variables,
    override: true,
    isSecret: true,
  });
  console.log(
    `Synced ${names.length} production worker variables to Trigger.dev.`,
  );
}
