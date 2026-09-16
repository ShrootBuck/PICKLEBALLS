// Only encoder-generated, flat asset names are allowed in a published playlist.
export const hlsAssetName = /^(?:master|v\d+|v\d+_\d+)\.(?:m3u8|ts)$/;
export const hlsContentType = "application/vnd.apple.mpegurl";

export function rewriteHlsPlaylist(
  playlist: string,
  resolve: (name: string) => string,
) {
  if (!playlist.startsWith("#EXTM3U")) throw new Error("Invalid playlist.");
  const asset = (name: string) => {
    if (!hlsAssetName.test(name)) throw new Error("Invalid playlist asset.");
    return resolve(name);
  };
  return playlist
    .split("\n")
    .map((line) => {
      const value = line.trim();
      if (!value) return line;
      if (!value.startsWith("#")) return asset(value);
      return line.replace(
        /URI="([^"]+)"/g,
        (_, name: string) => `URI="${asset(name)}"`,
      );
    })
    .join("\n");
}

export function readHlsSegments(playlist: string) {
  if (!playlist.startsWith("#EXTM3U") || !playlist.includes("#EXT-X-ENDLIST"))
    throw new Error("Incomplete video playlist.");
  const segments: { name: string; duration: number }[] = [];
  let duration = 0;
  for (const line of playlist.split("\n").map((line) => line.trim())) {
    if (line.startsWith("#EXTINF:"))
      duration = Number(line.slice(8).split(",")[0]);
    else if (line && !line.startsWith("#")) {
      if (
        !hlsAssetName.test(line) ||
        !line.endsWith(".ts") ||
        !(duration > 0) ||
        !Number.isFinite(duration)
      )
        throw new Error("Invalid video segment.");
      segments.push({ name: line, duration });
      duration = 0;
    }
  }
  if (!segments.length) throw new Error("Empty video playlist.");
  return segments;
}
