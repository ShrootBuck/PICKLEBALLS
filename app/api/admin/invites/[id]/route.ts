import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

// Revoke = soft-delete. The token hash stays so old links stay dead.
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/admin/invites/[id]">,
) {
  if (!hasSameOrigin(_request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(_request.headers);
  if (!auth || auth.membership.role !== "OWNER") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { id } = await context.params;
  const revoked = await getPrisma().invite.updateMany({
    where: {
      id,
      circleId: auth.membership.circleId,
      usedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  if (revoked.count === 0) {
    return NextResponse.json(
      { error: "Invite is already used, revoked, or gone." },
      { status: 409 },
    );
  }
  await getPrisma().activityEvent.create({
    data: {
      circleId: auth.membership.circleId,
      actorId: auth.session.user.id,
      kind: "INVITE_REVOKED",
      entityId: id,
      summary: "revoked an invite",
    },
  });
  return NextResponse.json({ revoked: true });
}
