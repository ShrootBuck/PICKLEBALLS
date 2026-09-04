import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import {
  type defaultNotificationPrefs,
  getNotificationPrefs,
} from "@/lib/notifications";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { notificationPreferencesSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const prefs = await getNotificationPrefs(auth.session.user.id);
  return NextResponse.json({ preferences: prefs });
}

export async function PUT(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  try {
    const parsed = notificationPreferencesSchema.safeParse(
      await readJson(request),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid preferences." },
        { status: 400 },
      );
    }
    const prefs = await getPrisma().notificationPreference.upsert({
      where: { userId: auth.session.user.id },
      update: parsed.data,
      create: { userId: auth.session.user.id, ...parsed.data },
    });
    return NextResponse.json({
      preferences: {
        replies: prefs.replies,
        proofsSubmitted: prefs.proofsSubmitted,
        proofReviews: prefs.proofReviews,
        taskMissed: prefs.taskMissed,
        taskCreated: prefs.taskCreated,
        checkIns: prefs.checkIns,
      } satisfies typeof defaultNotificationPrefs,
    });
  } catch (error) {
    return jsonError(error);
  }
}
