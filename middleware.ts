import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Defense in depth: per-route `requirePageMembership` / `getRequestMembership`
// is still the source of truth. This just fails closed at the edge when a
// future route forgets its check — no session cookie, no dashboard.
const SESSION_COOKIES = [
  "__Secure-pickle-balls.session_token",
  "pickle-balls.session_token",
];

export function middleware(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSession) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // api/auth is Better Auth's own flow; api/cron uses a bearer secret,
    // not a session cookie — neither goes through the cookie gate.
    "/((?!sign-in|sign-up|join|check-email|forgot-password|reset-password|api/auth|api/cron|_next|icon|apple-icon|favicon.ico|.*\\..*).*)",
  ],
};
