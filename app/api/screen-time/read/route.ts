import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import {
  readScreenTimeInBackground,
  screenTimeReadStatus,
} from "@/lib/background";
import { DomainError } from "@/lib/errors";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

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
    const result = await readScreenTimeInBackground(
      auth.session.user.id,
      auth.membership.circleId,
      parsed.data.mediaId,
      parsed.data.weekStart,
    );
    return Response.json(result, { status: result.runId ? 202 : 200 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId || !/^run_[a-zA-Z0-9]+$/.test(runId) || runId.length > 100)
    return Response.json({ error: "Invalid read." }, { status: 400 });
  try {
    const result = await screenTimeReadStatus(
      runId,
      auth.session.user.id,
      auth.membership.circleId,
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
