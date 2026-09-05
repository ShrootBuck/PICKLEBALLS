"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

const PREF_META = [
  {
    key: "replies",
    label: "Replies to my stuff",
    hint: "Replies to tasks, photos, and reviews",
  },
  {
    key: "proofsSubmitted",
    label: "Proofs need review",
    hint: "A friend posted a photo",
  },
  {
    key: "proofReviews",
    label: "My proof verdicts",
    hint: "Approved or challenged",
  },
  {
    key: "taskMissed",
    label: "Missed tasks",
    hint: "Deadline passed with no proof",
  },
  {
    key: "taskCreated",
    label: "New and edited tasks",
    hint: "Optional updates from the squad",
  },
  {
    key: "checkIns",
    label: "Check-ins",
    hint: "Optional status updates from friends",
  },
] as const;

type Prefs = Record<(typeof PREF_META)[number]["key"], boolean>;

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries a failed request
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    fetch("/api/notifications/preferences", { signal: controller.signal })
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
  }, [attempt]);

  async function toggle(key: keyof Prefs, checked: boolean) {
    if (!prefs || saving) return;
    const previous = prefs;
    const next = { ...prefs, [key]: checked };
    setPrefs(next);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/notifications/preferences", {
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
    <div className="flex flex-col gap-3">
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
