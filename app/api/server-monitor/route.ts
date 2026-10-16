import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { readServerMonitor } from "@/lib/server-monitor-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403, headers });
  if (!(await getRequestMembership(request.headers)))
    return Response.json({ error: "Sign in first." }, { status: 401, headers });
  return Response.json(await readServerMonitor(), { headers });
}
