"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  devicePushRegistration,
  disconnectDevicePush,
} from "@/lib/device-push";

type PushState =
  | "unsupported"
  | "denied"
  | "subscribed"
  | "unsubscribed"
  | "loading";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const safe = (base64 + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = window.atob(safe);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
}

export function PushToggle() {
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    devicePushRegistration()
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (subscription) => {
        if (!subscription) {
          setState("unsubscribed");
          return;
        }
        const response = await fetch(
          `/api/push/subscriptions?endpoint=${encodeURIComponent(subscription.endpoint)}`,
        );
        if (!response.ok) throw new Error("Could not check subscription.");
        const data = await response.json();
        setState(data.subscribed ? "subscribed" : "unsubscribed");
      })
      .catch(() => setState("unsubscribed"));
  }, []);

  const enable = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "unsubscribed");
        return;
      }
      const registration = await devicePushRegistration();
      const { publicKey } = (await fetch("/api/push/public-key").then((r) =>
        r.json(),
      )) as { publicKey?: string };
      if (!publicKey) throw new Error("Push not configured on server.");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = subscription.toJSON();
      await postJson("/api/push/subscriptions", {
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent.slice(0, 500),
      });
      setState("subscribed");
    } catch (err) {
      console.warn("Enabling push failed", err);
      setError("Couldn't turn on push. Try again from the installed app.");
      setState("unsubscribed");
    }
  }, []);

  const disable = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      await disconnectDevicePush();
      setState("unsubscribed");
    } catch (err) {
      console.warn("Disabling push failed", err);
      setError("Couldn't turn off push. Try again.");
      setState("subscribed");
    }
  }, []);

  if (state === "unsupported") {
    return (
      <p className="px-2 py-1.5 text-xs text-muted-foreground">
        Push isn't supported in this browser. New replies will still show up
        under For you.
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p className="px-2 py-1.5 text-xs text-muted-foreground">
        Notifications are blocked. Allow them in your browser or OS settings,
        then come back here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Push notifications</p>
          <p className="text-[11px] text-muted-foreground">
            {state === "subscribed"
              ? "On — this device gets buzzed."
              : "Off — turn it on to get buzzed."}
          </p>
        </div>
        <Button
          size="sm"
          variant={state === "subscribed" ? "secondary" : "default"}
          disabled={state === "loading"}
          onClick={state === "subscribed" ? disable : enable}
        >
          {state === "loading"
            ? "…"
            : state === "subscribed"
              ? "Turn off"
              : "Turn on"}
        </Button>
      </div>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
