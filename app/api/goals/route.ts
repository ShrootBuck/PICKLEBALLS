import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { createGoal } from "@/lib/goals";
import { getPrisma } from "@/lib/prisma";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export async function GET(request: Request) {
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const goals = await getPrisma().goal.findMany({
      where: {
        userId: auth.session.user.id,
        circleId: auth.membership.circleId,
        status: "ACTIVE",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, title: true },
    });
    return NextResponse.json(
      {
        circleId: auth.membership.circleId,
        goals,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "goals", 30, 60_000);
    const goal = await createGoal(
      auth.session.user.id,
      auth.membership.circleId,
      await readJson(request),
    );
    return NextResponse.json({ goal }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
