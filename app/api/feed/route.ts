import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import { getRequestMembership } from "@/lib/request";
import { getFeedPage } from "@/lib/social-data";

export async function GET(request: Request) {
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const query = z
    .object({
      filter: z.enum(["review"]).optional(),
      cursor: z.string().max(1500).optional(),
      memberId: z.string().min(1).max(100).optional(),
    })
    .refine(
      (value) => !(value.filter && value.memberId),
      "Choose a profile or review filter.",
    )
    .safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success)
    return NextResponse.json({ error: "Invalid feed query." }, { status: 400 });
  try {
    return NextResponse.json(
      await getFeedPage({
        viewerId: auth.session.user.id,
        circleId: auth.membership.circleId,
        ...query.data,
        pendingOnly: query.data.filter === "review",
      }),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
