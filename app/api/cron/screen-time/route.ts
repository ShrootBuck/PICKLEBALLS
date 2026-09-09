import { sendScreenTimeReminders } from "@/lib/screen-time-server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Not found." }, { status: 404 });
  if (process.env.TRIGGER_SCHEDULES_ENABLED === "true")
    return Response.json({ skipped: true, scheduler: "trigger.dev" });

  const result = await sendScreenTimeReminders();
  return Response.json(result, { status: result.failed ? 500 : 200 });
}
