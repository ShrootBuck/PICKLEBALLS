import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { postLikeSchema, setPostLike } from "@/lib/post-likes";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export async function PUT(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "likes", 120, 60_000);
    const parsed = postLikeSchema.safeParse(await readJson(request));
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid like." }, { status: 400 });
    return NextResponse.json(
      await setPostLike(
        auth.session.user.id,
        auth.membership.circleId,
        parsed.data,
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
