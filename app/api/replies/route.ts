import { after, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { notifyReplyReceived } from "@/lib/notifications";
import { getPrisma } from "@/lib/prisma";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { createSocialReply } from "@/lib/social-replies";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  try {
    await limitAction(auth.session.user.id, "replies", 60, 60_000);
    const reply = await createSocialReply(
      auth.session.user.id,
      auth.membership.circleId,
      await readJson(request),
    );
    // Inbox + push fan-out runs after the response so replies feel instant.
    const authorId = auth.session.user.id;
    const circleId = auth.membership.circleId;
    const replyId = reply.id;
    after(async () => {
      try {
        await notifyReplyReceived({ replyId, authorId, circleId });
      } catch (error) {
        console.warn("Reply notification fan-out failed", {
          replyId,
          circleId,
          error,
        });
      }
    });
    return NextResponse.json({ reply }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const query = z
    .object({
      targetType: z.enum(["COMMITMENT", "CHECK_IN", "PROOF", "REVIEW"]),
      targetId: z.string().min(1).max(100),
      before: z.string().min(1).max(100).optional(),
    })
    .safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success)
    return NextResponse.json(
      { error: "Invalid reply query." },
      { status: 400 },
    );
  try {
    const { targetType, targetId, before } = query.data;
    const field = {
      COMMITMENT: "commitmentId",
      CHECK_IN: "checkInId",
      PROOF: "proofId",
      REVIEW: "reviewId",
    }[targetType];
    const where = { circleId: auth.membership.circleId, [field]: targetId };
    const cursor = before
      ? await getPrisma().socialReply.findFirst({
          where: { ...where, id: before },
          select: { createdAt: true, id: true },
        })
      : null;
    if (before && !cursor)
      return NextResponse.json({ error: "Reply not found." }, { status: 404 });
    const rows = await getPrisma().socialReply.findMany({
      where: {
        ...where,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      include: {
        author: {
          select: { id: true, name: true, image: true, initials: true },
        },
      },
    });
    return NextResponse.json({
      replies: rows.slice(0, 50),
      hasMore: rows.length > 50,
    });
  } catch (error) {
    return jsonError(error);
  }
}
