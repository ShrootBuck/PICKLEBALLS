// Browser push services only. Never let a saved subscription turn fan-out
// into an arbitrary server-side HTTP request (including for existing rows).
export function isPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      return false;
    return (
      url.hostname === "fcm.googleapis.com" ||
      url.hostname === "updates.push.services.mozilla.com" ||
      url.hostname === "web.push.apple.com" ||
      (url.hostname.endsWith(".notify.windows.com") &&
        url.hostname !== "notify.windows.com")
    );
  } catch {
    return false;
  }
}
