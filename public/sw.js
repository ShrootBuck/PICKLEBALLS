/* Pickle Balls push service worker. Push-only: no caching, so the app
   never serves stale HTML. */

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
