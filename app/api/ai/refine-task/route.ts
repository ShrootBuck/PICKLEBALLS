import { NextResponse } from "next/server";
import { refineTask } from "@/lib/ai";
import { jsonError } from "@/lib/api";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { taskRefinementInputSchema } from "@/lib/schemas";
import { DomainError } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const parsed = taskRefinementInputSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new DomainError("Give the model a real task first.");
    const suggestion = await refineTask(
      auth.session.user.id,
      auth.membership.circleId,
      parsed.data,
    );
    return NextResponse.json({ suggestion });
  } catch (error) {
    return jsonError(error);
  }
}
