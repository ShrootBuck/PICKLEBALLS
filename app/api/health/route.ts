import { getPrisma } from "@/lib/prisma";
import { releaseCommit } from "@/lib/release-id";
import { workerRelease } from "@/lib/release-status";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return Response.json(
      {
        status: "ok",
        deployment: releaseCommit,
        // Container readiness must never wait for the worker: web migrates first.
        ...(new URL(request.url).searchParams.get("release") === "1"
          ? { worker: await workerRelease(process.env.WORKER_HEALTH_URL) }
          : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
