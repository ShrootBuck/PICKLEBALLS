import { task } from "@trigger.dev/sdk";

// Safe dashboard smoke test: no database writes, AI calls, or notifications.
export const healthCheck = task({
  id: "health-check",
  maxDuration: 30,
  run: async () => ({ ok: true, project: "pickleballs" }),
});
