import { NextResponse } from "next/server";
import { coachBlocker } from "@/lib/ai";
import { jsonError, readJson } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { aiUnblockSchema } from "@/lib/schemas";
import { DomainError } from "@/lib/tasks";
import { phoenixDateKey, requireDateKey } from "@/lib/time";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const parsed = aiUnblockSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new DomainError("Bad unblock request.");
    const day = requireDateKey(phoenixDateKey());
    const tasks = await getPrisma().commitment.findMany({
      where: {
        userId: auth.session.user.id,
        circleId: auth.membership.circleId,
        day,
      },
      select: { title: true },
      orderBy: { dueAt: "asc" },
      take: 50,
    });
    const result = await coachBlocker(
      auth.session.user.id,
      auth.membership.circleId,
      {
        signal: parsed.data.signal,
        blocker: parsed.data.blocker ?? "",
        tasks: tasks.map((task) => task.title),
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
