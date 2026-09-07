import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { getInitials } from "@/lib/names";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

const memberNameSchema = z.object({
  circleId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
});

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/admin/members/[id]">,
) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth || auth.membership.role !== "OWNER") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const parsed = memberNameSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter a name between 1 and 80 characters." },
        { status: 400 },
      );
    }
    if (parsed.data.circleId !== auth.membership.circleId) {
      return NextResponse.json(
        { error: "Your active circle changed. Refresh and try again." },
        { status: 409 },
      );
    }
    const { id } = await context.params;
    const updated = await getPrisma().user.updateMany({
      where: {
        id,
        memberships: { some: { circleId: auth.membership.circleId } },
      },
      data: { name: parsed.data.name, initials: getInitials(parsed.data.name) },
    });
    if (!updated.count) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }
    return NextResponse.json({ name: parsed.data.name });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/admin/members/[id]">,
) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth || auth.membership.role !== "OWNER") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  if (body?.circleId !== auth.membership.circleId) {
    return NextResponse.json(
      { error: "Your active circle changed. Refresh and try again." },
      { status: 409 },
    );
  }
  const { id } = await context.params;
  const deleted = await getPrisma().membership.deleteMany({
    where: { userId: id, circleId: auth.membership.circleId, role: "MEMBER" },
  });
  if (!deleted.count) {
    return NextResponse.json(
      { error: "Member not found. Owners cannot be deleted." },
      { status: 404 },
    );
  }
  return NextResponse.json({ deleted: true });
}
