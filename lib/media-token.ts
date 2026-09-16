// Web Crypto keeps the same signing implementation usable in Node and Workers.
const encoder = new TextEncoder();
export const playbackLifetimeSeconds = 6 * 3600;

async function signingKey(secret: string) {
  if (secret.length < 32)
    throw new Error("Media signing secret must be at least 32 characters.");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signMediaScope(
  scope: string,
  expires: number,
  secret: string,
) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    encoder.encode(`${expires}\n${scope}`),
  );
  return new URLSearchParams({
    scope,
    expires: String(expires),
    signature: Array.from(new Uint8Array(signature), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
  });
}

export async function verifyMediaScope(
  url: URL,
  secret: string,
  now = Date.now(),
) {
  const scope = url.searchParams.get("scope") ?? "";
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") ?? "";
  const key = url.pathname.slice(1);
  if (
    !/^media\/v_[a-f0-9-]{36}\/[a-f0-9-]{36}\/hls\/$/.test(scope) ||
    !key.startsWith(scope) ||
    !Number.isSafeInteger(expires) ||
    expires <= now / 1000 ||
    expires > now / 1000 + playbackLifetimeSeconds + 60 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return false;
  return crypto.subtle.verify(
    "HMAC",
    await signingKey(secret),
    Uint8Array.from(signature.match(/../g) ?? [], (hex) =>
      Number.parseInt(hex, 16),
    ),
    encoder.encode(`${expires}\n${scope}`),
  );
}
