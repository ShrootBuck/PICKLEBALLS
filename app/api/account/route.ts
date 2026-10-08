import { after, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { auth } from "@/lib/auth";
import { ACTIVE_CIRCLE_COOKIE } from "@/lib/circle-cookie";
import { drainObjectDeletions } from "@/lib/deletion-storage";
import { deleteOwnAccount } from "@/lib/deletions";
import { limitAction } from "@/lib/rate-limit";
import { hasSameOrigin } from "@/lib/request";

export async function DELETE(request: Request) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403 });
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (!session)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const body = (await readJson(request)) as { confirmation?: string };
    await limitAction(session.user.id, "account-deletion", 5, 60_000);
    await deleteOwnAccount(
      session.user.id,
      session.session.id,
      body?.confirmation ?? "",
    );
    const response = NextResponse.json({ deleted: true });
    // Let Better Auth clear its own cookie names and attributes.
    const signedOut = await auth.api.signOut({
      headers: request.headers,
      asResponse: true,
    });
    for (const cookie of signedOut.headers.getSetCookie())
      response.headers.append("set-cookie", cookie);
    response.cookies.delete(ACTIVE_CIRCLE_COOKIE);
    after(() =>
      drainObjectDeletions().catch(() =>
        console.error("File cleanup will retry."),
      ),
    );
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
