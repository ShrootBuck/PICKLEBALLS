"use client";

import { useEffect, useId, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appFetch } from "@/lib/app-refresh";
import type { NotificationPrefs } from "@/lib/notification-policy";

const PREF_META = [
  {
    key: "proofsSubmitted",
    label: "Friends’ proof photos",
    hint: "Push alerts when a friend posts proof. Photos always appear in your inbox.",
  },
  {
    key: "streakReminders",
    label: "Streak reminders",
    hint: "A morning check for quit streaks and an evening reminder for build streaks you haven’t logged.",
  },
  {
    key: "streakWarnings",
    label: "Last-chance streak warnings",
    hint: "A heads-up in the evening when a streak would break at midnight.",
  },
] as const;

const HOUR_META = [
  { key: "streakMorningHour", label: "Morning reminder" },
  { key: "streakEveningHour", label: "Evening reminder" },
] as const;

const hourItems = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`,
}));

export function NotificationPreferences() {
  const id = useId();
  const version = useRefreshVersion();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  async function save<K extends keyof NotificationPrefs>(
    key: K,
    value: NotificationPrefs[K],
  ) {
    if (!prefs || saving) return;
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    setSaveError(null);
    try {
      const response = await appFetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("Could not save.");
    } catch {
      setPrefs(previous);
      setSaveError("That preference was not saved. Try again.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Replies to your posts and threads you’ve commented in always appear in
        your inbox, along with proof verdicts and streak nudges. Push alerts
        arrive when enabled on this device.
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
                <FieldLabel htmlFor={`${id}-${meta.key}`}>
                  {meta.label}
                </FieldLabel>
                <FieldDescription id={`${id}-${meta.key}-help`}>
                  {meta.hint}
                </FieldDescription>
              </FieldContent>
              <Checkbox
                id={`${id}-${meta.key}`}
                aria-describedby={`${id}-${meta.key}-help`}
                checked={prefs[meta.key]}
                disabled={saving}
                onCheckedChange={(checked) => save(meta.key, checked)}
              />
            </Field>
          ))}
          {HOUR_META.map((meta) => (
            <Field
              key={meta.key}
              orientation="horizontal"
              data-disabled={saving}
            >
              <FieldContent>
                <FieldLabel htmlFor={`${id}-${meta.key}`}>
                  {meta.label}
                </FieldLabel>
                <FieldDescription>Phoenix time</FieldDescription>
              </FieldContent>
              <Select
                items={hourItems}
                value={String(prefs[meta.key])}
                onValueChange={(value) => {
                  if (value !== null) save(meta.key, Number(value));
                }}
                disabled={saving}
              >
                <SelectTrigger id={`${id}-${meta.key}`} className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {hourItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ))}
        </FieldGroup>
      ) : !error ? (
        <p className="text-sm text-muted-foreground">Loading preferences…</p>
      ) : null}
      {saveError || error ? (
        <p role="alert" className="text-sm text-destructive">
          {saveError ?? error}
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
