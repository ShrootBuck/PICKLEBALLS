import { after, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { auth } from "@/lib/auth";
import { ACTIVE_CIRCLE_COOKIE, parseActiveCircleId } from "@/lib/circle-cookie";
import { circleNameError, circleNameSchema } from "@/lib/circle-name";
import { renameCircle } from "@/lib/circles";
import { drainObjectDeletions } from "@/lib/deletion-storage";
import { changeCircleLifecycle } from "@/lib/deletions";
import { DomainError } from "@/lib/errors";
import { limitAction } from "@/lib/rate-limit";
import { hasSameOrigin } from "@/lib/request";

type Context = { params: Promise<{ id: string }> };
const schema = z.object({
  action: z.enum(["leave", "transfer", "delete"]),
  confirmation: z.string().optional(),
  successorId: z.string().optional(),
});
const renameSchema = z.object({
  action: z.literal("rename"),
  name: circleNameSchema,
});
export async function PATCH(request: Request, { params }: Context) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const { id } = await params;
    const input = await readJson(request);
    if (
      input &&
      typeof input === "object" &&
      "action" in input &&
      input.action === "rename"
    ) {
      const parsed = renameSchema.safeParse(input);
      if (!parsed.success) throw new DomainError(circleNameError);
      await limitAction(session.user.id, "circle-rename", 20, 60_000);
      return NextResponse.json(
        await renameCircle(session.user.id, id, parsed.data.name),
      );
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new DomainError("Choose a valid circle action.");
    const body = parsed.data;
    await limitAction(session.user.id, "circle-lifecycle", 20, 60_000);
    await changeCircleLifecycle(
      session.user.id,
      id,
      body.action,
      body.confirmation,
      body.successorId,
    );
    const response = NextResponse.json({ success: true });
    if (
      body.action !== "transfer" &&
      parseActiveCircleId(request.headers.get("cookie")) === id
    )
      response.cookies.delete(ACTIVE_CIRCLE_COOKIE);
    after(() =>
      drainObjectDeletions().catch(() =>
        console.error("File cleanup will retry."),
      ),
    );
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
