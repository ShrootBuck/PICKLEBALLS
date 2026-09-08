import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import {
  getStoryGroups,
  markStoryViewed,
  storyViewSchema,
} from "@/lib/story-data";

export async function GET(request: Request) {
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json(
      await getStoryGroups(auth.session.user.id, auth.membership.circleId),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const parsed = storyViewSchema.safeParse(await readJson(request, 2048));
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid story." }, { status: 400 });
    if (parsed.data.circleId !== auth.membership.circleId)
      return NextResponse.json({ error: "Story not found." }, { status: 404 });
    await limitAction(auth.session.user.id, "story-views", 240, 60_000);
    return NextResponse.json(
      await markStoryViewed(auth.session.user.id, parsed.data),
    );
  } catch (error) {
    return jsonError(error);
  }
}
