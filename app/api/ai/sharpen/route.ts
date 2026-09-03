import { NextResponse } from "next/server";
import { sharpenTask } from "@/lib/ai";
import { jsonError } from "@/lib/api";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { aiSharpenSchema } from "@/lib/schemas";
import { DomainError } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const parsed = aiSharpenSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new DomainError("Give the AI a real title first.");
    const result = await sharpenTask(
      auth.session.user.id,
      auth.membership.circleId,
      {
        title: parsed.data.title,
        definitionOfDone: parsed.data.definitionOfDone ?? "",
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
