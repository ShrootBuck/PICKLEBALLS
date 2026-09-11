import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { readScreenTimeInBackground } from "@/lib/background";
import { DomainError } from "@/lib/errors";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { parseTopApps } from "@/lib/screen-time";

export const runtime = "nodejs";
export const maxDuration = 120;
const schema = z.object({
  mediaId: z.string().startsWith("i_").max(100),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  circleId: z.string().min(1).max(64),
});

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const parsed = schema.safeParse(await readJson(request, 4096));
    if (!parsed.success)
      throw new DomainError("Choose one screenshot for the requested week.");
    if (parsed.data.circleId !== auth.membership.circleId)
      throw new DomainError(
        "Your active circle changed. Reload before uploading.",
        409,
      );
    await limitAction(auth.session.user.id, "screen-time-read", 20, 3_600_000);
    const reading = await readScreenTimeInBackground(
      auth.session.user.id,
      auth.membership.circleId,
      parsed.data.mediaId,
      parsed.data.weekStart,
    );
    return Response.json({
      reading: {
        id: reading.id,
        mediaId: reading.mediaId,
        weekStart: reading.weekStart.toISOString().slice(0, 10),
        dailyAverageMinutes: reading.dailyAverageMinutes,
        totalMinutes: reading.totalMinutes,
        topApps: parseTopApps(reading.topApps),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
