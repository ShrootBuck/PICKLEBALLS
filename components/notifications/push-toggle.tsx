"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { appFetch } from "@/lib/app-refresh";
import {
  devicePushRegistration,
  disconnectDevicePush,
} from "@/lib/device-push";
import { cn } from "@/lib/utils";

type PushState =
  | "install"
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
  const response = await appFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
}

export function PushToggle({ inset = true }: { inset?: boolean }) {
  // The inset matches the inbox popover's list rows. Padded panels opt out.
  const pad = inset ? "px-2 py-1.5" : undefined;
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (
      ios &&
      !window.matchMedia("(display-mode: standalone)").matches &&
      !(navigator as Navigator & { standalone?: boolean }).standalone
    ) {
      setState("install");
      return;
    }
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
        const response = await appFetch(
          `/api/push/subscriptions?endpoint=${encodeURIComponent(subscription.endpoint)}`,
        );
        if (!response.ok) throw new Error("Could not check subscription.");
        const data = await response.json();
        setState(data.subscribed ? "subscribed" : "unsubscribed");
      })
      .catch(() => {
        setError(
          "Couldn't check this device's notifications. Try turning them on again.",
        );
        setState("unsubscribed");
      });
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
      const response = await appFetch("/api/push/public-key");
      if (response.status === 503) {
        setError(
          "Push notifications aren't configured on the server yet. Your inbox still gets updates.",
        );
        setState("unsubscribed");
        return;
      }
      if (!response.ok) throw new Error("Could not load push configuration.");
      const { publicKey } = (await response.json()) as { publicKey?: string };
      if (!publicKey) throw new Error("Missing push public key.");
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
      if (Notification.permission === "denied") {
        setState("denied");
      } else {
        setError(
          "Couldn't turn on notifications. Check your connection and try again.",
        );
        setState("unsubscribed");
      }
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

  if (state === "install") {
    return (
      <div className={cn("flex flex-col gap-2", pad)}>
        <p className="text-[13px] font-semibold">
          Enable notifications on iPhone or iPad
        </p>
        <ol className="flex list-decimal flex-col gap-1 pl-4 text-xs text-muted-foreground">
          <li>Open this site in Safari, tap Share, then Add to Home Screen.</li>
          <li>Open Pickle Balls from your Home Screen.</li>
          <li>Tap the bell, then Enable notifications and Allow.</li>
        </ol>
      </div>
    );
  }
  if (state === "unsupported") {
    return (
      <p className={cn("text-xs text-muted-foreground", pad)}>
        Push isn't supported in this browser. Notifications still appear in your
        inbox.
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p className={cn("text-xs text-muted-foreground", pad)}>
        Notifications are blocked. Allow them in your browser's site settings or
        your device's Settings &gt; Notifications &gt; Pickle Balls, then reopen
        the app. Notifications still appear in your inbox.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", pad)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1 basis-40">
          <p className="text-[13px] font-semibold">Device notifications</p>
          <p className="text-[11px] text-muted-foreground">
            {state === "loading"
              ? "Checking notifications…"
              : state === "subscribed"
                ? "On, including when the app is closed."
                : "Get alerts even when the app is closed."}
          </p>
        </div>
        <Button
          size="sm"
          variant={state === "subscribed" ? "secondary" : "default"}
          disabled={state === "loading"}
          className="shrink-0"
          onClick={state === "subscribed" ? disable : enable}
        >
          {state === "loading"
            ? "…"
            : state === "subscribed"
              ? "Turn off"
              : "Enable notifications"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
