import { getPrisma } from "@/lib/prisma";
import { getRequestMembership } from "@/lib/request";

export async function GET(request: Request) {
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  const ids = new URL(request.url).searchParams.getAll("id").slice(0, 6);
  const media = await getPrisma().mediaUpload.findMany({
    where: {
      id: { in: ids },
      ownerId: auth.session.user.id,
      circleId: auth.membership.circleId,
    },
    select: { id: true, ready: true, progress: true, processingError: true },
  });
  return Response.json(
    { media },
    { headers: { "cache-control": "private, no-store" } },
  );
}
