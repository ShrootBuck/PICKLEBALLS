export const ACTIVE_CIRCLE_COOKIE = "pb_active_circle";

export function parseActiveCircleId(cookieHeader: string | null) {
  for (const part of cookieHeader?.split(";") ?? []) {
    const index = part.indexOf("=");
    if (index === -1 || part.slice(0, index).trim() !== ACTIVE_CIRCLE_COOKIE)
      continue;
    try {
      const value = decodeURIComponent(part.slice(index + 1).trim());
      return value && value.length <= 64 ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}
