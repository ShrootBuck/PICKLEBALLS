import { NextResponse } from "next/server";
import { extractScreenTime } from "@/lib/ai";
import { jsonError } from "@/lib/api";
import { sanitizeImage } from "@/lib/image";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File))
      return NextResponse.json(
        { error: "Attach a Screen Time screenshot." },
        { status: 400 },
      );
    const image = await sanitizeImage(file);
    const extraction = await extractScreenTime(
      auth.session.user.id,
      auth.membership.circleId,
      image,
    );
    return NextResponse.json({ extraction });
  } catch (error) {
    return jsonError(error);
  }
}
