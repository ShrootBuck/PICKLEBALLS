import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { confirmScreenTime } from "@/lib/screen-time-server";

export const runtime = "nodejs";
const schema = z.object({
  readingId: z.string().min(1).max(100),
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
      throw new DomainError("Read your screenshot before confirming it.");
    if (parsed.data.circleId !== auth.membership.circleId)
      throw new DomainError(
        "Your active circle changed. Reload before confirming.",
        409,
      );
    await limitAction(auth.session.user.id, "screen-time-confirm", 30, 600_000);
    const submission = await confirmScreenTime(
      auth.session.user.id,
      auth.membership.circleId,
      parsed.data.readingId,
    );
    return Response.json({ id: submission.id });
  } catch (error) {
    return jsonError(error);
  }
}
