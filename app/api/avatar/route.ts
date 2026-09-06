import { discordAvatarUrl } from "@/lib/avatar-url";
import { getRequestMembership } from "@/lib/request";
import { readBoundedBody } from "@/lib/request-body";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!(await getRequestMembership(request.headers)))
    return new Response(null, { status: 404 });
  const source = discordAvatarUrl(new URL(request.url).searchParams.get("src"));
  if (!source) return new Response(null, { status: 400 });
  try {
    const upstream = await fetch(source, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    const type = upstream.headers.get("content-type")?.split(";")[0];
    if (
      !upstream.ok ||
      !type ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(type)
    )
      return new Response(null, { status: 404 });
    const data = await readBoundedBody(
      new Request(source, {
        method: "POST",
        body: upstream.body,
        duplex: "half",
      } as RequestInit),
      1024 * 1024,
    );
    return new Response(data, {
      headers: {
        "content-type": type,
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response(null, {
      status: 502,
      headers: { "cache-control": "no-store" },
    });
  }
}
