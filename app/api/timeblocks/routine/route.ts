import { jsonError, readJson } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { timeblockRoutineSchema } from "@/lib/timeblock-routine";

export async function PUT(request: Request) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const parsed = timeblockRoutineSchema.safeParse(await readJson(request));
    if (!parsed.success)
      throw new DomainError("Check your class names and sleep times.");
    await getPrisma().user.update({
      where: { id: auth.session.user.id },
      data: { timeblockRoutine: parsed.data },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
