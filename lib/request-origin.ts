/** Validate browser mutations against public origins, not proxy/container URLs. */
export function hasSameOrigin(request: Request) {
  const allowed =
    process.env.PB_SELF_HOSTED === "true"
      ? [
          process.env.NEXT_PUBLIC_APP_URL,
          process.env.BETTER_AUTH_URL,
          ...(process.env.APP_ALLOWED_ORIGINS ?? "").split(","),
        ]
          .filter((value): value is string => Boolean(value?.trim()))
          .map((value) => value.trim())
      : [new URL(request.url).origin];
  const origin = request.headers.get("origin");
  if (origin) return allowed.includes(origin);
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return allowed.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  // A mutation must provide Origin or Referer. Host/forwarding headers alone
  // cannot establish that the request came from our own browser application.
  return false;
}
