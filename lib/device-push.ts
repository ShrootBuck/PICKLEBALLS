export async function devicePushRegistration() {
  if (!("serviceWorker" in navigator))
    throw new Error("Push is not supported.");
  // ready can wait forever if registration failed. Register explicitly and
  // bound the wait so the settings button never gets stuck on loading.
  let timer: number | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(() => navigator.serviceWorker.ready),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(
          () => reject(new Error("Service worker did not start.")),
          8_000,
        );
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

export async function disconnectDevicePush() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  const response = await fetch("/api/push/subscriptions", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok)
    throw new Error("Could not disconnect this device's notifications.");
  await subscription.unsubscribe();
}
