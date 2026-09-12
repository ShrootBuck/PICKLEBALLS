"use client";

import { useEffect, useState } from "react";
import { useRefreshVersion } from "@/components/layout/app-refresh-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { appFetch } from "@/lib/app-refresh";
import type { NotificationPrefs } from "@/lib/notification-policy";

const PREF_META = [
  {
    key: "proofsSubmitted",
    label: "Friends’ proof photos",
    hint: "Push alerts when a friend posts proof. Photos always appear in your inbox.",
  },
  {
    key: "screenTime",
    label: "Weekly screen-time reminder",
    hint: "A Sunday reminder to upload the completed week.",
  },
] as const;

export function NotificationPreferences() {
  const version = useRefreshVersion();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt and version request fresh server preferences
  useEffect(() => {
    if (saving) return;
    const controller = new AbortController();
    setError(null);
    appFetch("/api/notifications/preferences", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load preferences.");
        const data = await response.json();
        if (!controller.signal.aborted) setPrefs(data.preferences);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Could not load your preferences.");
      });
    return () => controller.abort();
  }, [attempt, version, saving]);

  async function toggle(key: keyof NotificationPrefs, checked: boolean) {
    if (!prefs || saving) return;
    const previous = prefs;
    const next = { ...prefs, [key]: checked };
    setPrefs(next);
    setSaving(true);
    setError(null);
    try {
      const response = await appFetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("Could not save.");
    } catch {
      setPrefs(previous);
      setError("That preference was not saved. Try again.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Replies to your posts and threads you’ve commented in always appear in
        your inbox, along with proof verdicts. Push alerts arrive when enabled
        on this device.
      </p>
      {prefs ? (
        <FieldGroup className="gap-3">
          {PREF_META.map((meta) => (
            <Field
              key={meta.key}
              orientation="horizontal"
              data-disabled={saving}
            >
              <FieldContent>
                <FieldLabel htmlFor={`pref-${meta.key}`}>
                  {meta.label}
                </FieldLabel>
                <FieldDescription>{meta.hint}</FieldDescription>
              </FieldContent>
              <Checkbox
                id={`pref-${meta.key}`}
                checked={prefs[meta.key]}
                disabled={saving}
                onCheckedChange={(checked) => toggle(meta.key, checked)}
              />
            </Field>
          ))}
        </FieldGroup>
      ) : !error ? (
        <p className="text-sm text-muted-foreground">Loading preferences…</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!prefs && error ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}
