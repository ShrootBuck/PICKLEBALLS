import { NextResponse } from "next/server";
import { generateSquadDigest } from "@/lib/ai";
import { jsonError } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { phoenixDateKey, requireDateKey } from "@/lib/time";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const day = requireDateKey(phoenixDateKey());
    const existing = await getPrisma().dailySquadDigest.findUnique({
      where: { circleId_day: { circleId: auth.membership.circleId, day } },
    });
    if (existing) return NextResponse.json({ digest: existing, cached: true });
    const members = await getPrisma().membership.findMany({
      where: { circleId: auth.membership.circleId },
      include: {
        user: {
          include: {
            commitments: {
              where: { circleId: auth.membership.circleId, day },
              include: { proofs: { where: { replacedById: null }, take: 1 } },
            },
            checkIns: {
              where: { circleId: auth.membership.circleId, day },
              take: 1,
            },
          },
        },
      },
    });
    const facts = JSON.stringify(
      members.map((membership) => ({
        name: membership.user.name,
        checkIn: membership.user.checkIns[0] ?? null,
        tasks: membership.user.commitments.map((task) => ({
          title: task.title,
          status: task.status,
          dueAt: task.dueAt,
          lateProof: task.proofs[0]?.isLate ?? false,
        })),
      })),
    );
    const output = await generateSquadDigest(
      auth.session.user.id,
      auth.membership.circleId,
      facts,
    );
    // Use upsert to handle concurrent requests racing to create the same day's digest.
    const digest = await getPrisma().dailySquadDigest.upsert({
      where: { circleId_day: { circleId: auth.membership.circleId, day } },
      create: {
        circleId: auth.membership.circleId,
        day,
        summary: output.summary,
        needsHelp: output.needsHelp,
      },
      update: {},
    });
    const wasCached = digest.summary !== output.summary;
    return NextResponse.json({ digest, cached: wasCached });
  } catch (error) {
    return jsonError(error);
  }
}
