/* Push notifications and immutable proof images. HTML is never cached. */

function localDestination(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return "/squad";
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : "/squad";
  } catch {
    return "/squad";
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Pickle Balls",
    body: "Something happened.",
    url: "/squad",
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) {
      try {
        payload.body = event.data.text();
      } catch {
        // keep defaults
      }
    }
  }
  const title =
    typeof payload.title === "string" ? payload.title : "Pickle Balls";
  const url = localDestination(payload.url);
  const options = {
    body:
      typeof payload.body === "string" ? payload.body : "Something happened.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: typeof payload.tag === "string" ? payload.tag : undefined,
    data: { url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data?.url;
  const url = localDestination(raw);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        try {
          if (new URL(client.url).origin === self.location.origin) {
            await client.focus();
            await client.navigate(url);
            return;
          }
        } catch {
          // ignore and open fresh
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// Proof IDs are immutable. Cache Storage has no time-based expiry and survives
// browser restarts; storage pressure or clearing site data can still evict it.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isProof =
    url.origin === self.location.origin &&
    /^\/api\/proofs\/[^/]+\/image$/.test(url.pathname);
  const isAvatar =
    event.request.destination === "image" &&
    ["cdn.discordapp.com", "fav.farm"].includes(url.hostname);
  if (event.request.method !== "GET" || (!isProof && !isAvatar)) return;
  event.respondWith(
    (async () => {
      let cache;
      try {
        cache = await caches.open("immutable-proof-images-v1");
        const cached = await cache.match(event.request);
        if (cached) return cached;
      } catch {
        // Storage may be unavailable; the network still works.
      }
      const response = await fetch(event.request);
      if (
        cache &&
        (response.type === "opaque" ||
          (response.ok &&
            response.headers.get("content-type")?.startsWith("image/")))
      ) {
        try {
          await cache.put(event.request, response.clone());
        } catch {
          // A full cache must not prevent displaying the photo.
        }
      }
      return response;
    })(),
  );
});
