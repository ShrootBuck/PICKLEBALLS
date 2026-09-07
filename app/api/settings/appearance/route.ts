import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { appearanceSchema } from "@/lib/appearance";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { hasSameOrigin } from "@/lib/request";

export async function PUT(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  try {
    const parsed = appearanceSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Choose a preset color." },
        { status: 400 },
      );
    }
    const appearance = await getPrisma().user.update({
      where: { id: session.user.id },
      data: parsed.data,
      select: { primaryColor: true },
    });
    return NextResponse.json({ appearance });
  } catch (error) {
    return jsonError(error);
  }
}
