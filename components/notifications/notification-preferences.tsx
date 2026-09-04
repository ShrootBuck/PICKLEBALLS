"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const PREF_META = [
  { key: "replies", label: "Replies to my stuff", hint: "Someone talks back" },
  {
    key: "proofsSubmitted",
    label: "Proofs need review",
    hint: "Squadmate posted a receipt",
  },
  {
    key: "proofReviews",
    label: "My proof verdicts",
    hint: "Approved or challenged",
  },
  {
    key: "taskMissed",
    label: "Missed tasks",
    hint: "Deadline passed, no proof",
  },
  {
    key: "taskCreated",
    label: "New tasks",
    hint: "Usually noise — off by default",
  },
  {
    key: "checkIns",
    label: "Check-ins",
    hint: "Usually noise — off by default",
  },
] as const;

type Prefs = Record<(typeof PREF_META)[number]["key"], boolean>;

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (data.preferences) setPrefs(data.preferences as Prefs);
      })
      .catch(() => undefined);
  }, []);

  async function toggle(key: keyof Prefs) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(key);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("save failed");
      const data = (await response.json()) as { preferences: Prefs };
      setPrefs(data.preferences);
    } catch {
      setPrefs(prefs);
    } finally {
      setSaving(null);
    }
  }

  if (!prefs) {
    return (
      <p className="px-2 py-1.5 text-xs text-muted-foreground">
        Loading preferences…
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {PREF_META.map((meta) => {
        const on = prefs[meta.key];
        return (
          <li key={meta.key}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => toggle(meta.key)}
              aria-pressed={on}
              disabled={saving !== null}
              className="h-auto w-full justify-between gap-2 whitespace-normal rounded-md px-2 py-1.5 text-left hover:bg-muted"
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">
                  {meta.label}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {meta.hint}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  on ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${
                    on ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
