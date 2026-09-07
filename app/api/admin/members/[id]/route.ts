import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

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
