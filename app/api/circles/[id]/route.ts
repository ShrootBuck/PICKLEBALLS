import { after, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { auth } from "@/lib/auth";
import { ACTIVE_CIRCLE_COOKIE, parseActiveCircleId } from "@/lib/circle-cookie";
import { drainObjectDeletions } from "@/lib/deletion-storage";
import { changeCircleLifecycle } from "@/lib/deletions";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { limitAction } from "@/lib/rate-limit";
import { hasSameOrigin } from "@/lib/request";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const member = await getPrisma().membership.findUnique({
    where: { userId_circleId: { userId: session.user.id, circleId: id } },
  });
  if (member?.role !== "OWNER")
    return Response.json({ error: "Not found." }, { status: 404 });
  const members = await getPrisma().membership.findMany({
    where: { circleId: id, userId: { not: session.user.id } },
    select: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return Response.json({ members: members.map((m) => m.user) });
}
const schema = z.object({
  action: z.enum(["leave", "transfer", "delete"]),
  confirmation: z.string().optional(),
  successorId: z.string().optional(),
});
export async function PATCH(request: Request, { params }: Context) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const { id } = await params;
    const parsed = schema.safeParse(await readJson(request));
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
