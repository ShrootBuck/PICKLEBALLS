import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership } from "@/lib/request";
import { getWrapped } from "@/lib/wrapped";
import { wrappedCard } from "@/lib/wrapped-card";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const query = new URL(request.url).searchParams;
    if (query.get("circle") !== auth.membership.circleId)
      throw new DomainError(
        "Your circle changed. Open its recap and try again.",
        409,
      );
    await limitAction(auth.session.user.id, "wrapped-card", 10, 60_000);
    const recap = await getWrapped(
      auth.membership.circleId,
      auth.session.user.id,
      query.get("week") ?? undefined,
    );
    return wrappedCard(recap);
  } catch (error) {
    return jsonError(error);
  }
}
