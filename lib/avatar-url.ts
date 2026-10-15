export function discordAvatarUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "cdn.discordapp.com" ||
      url.port ||
      url.username ||
      url.password
    )
      return null;
    if (
      !/^\/(?:avatars\/\d+\/(?:a_)?[a-f0-9]+\.(?:png|webp|jpg|gif)|embed\/avatars\/[0-5]\.png)$/.test(
        url.pathname,
      )
    )
      return null;
    url.search = "?size=128";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
export function avatarSrc(value: string | undefined, userId?: string) {
  // A default/missing picture must still be able to turn into a custom one.
  // Use a new URL shape so previously immutable responses cannot pin old photos.
  return userId && (!value || discordAvatarUrl(value))
    ? `/api/avatar?userId=${encodeURIComponent(userId)}`
    : value;
}
