import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { createCommitment } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const task = await createCommitment(
      auth.session.user.id,
      auth.membership.circleId,
      await request.json(),
    );
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
