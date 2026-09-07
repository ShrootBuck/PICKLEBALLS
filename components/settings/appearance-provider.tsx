"use client";

import { createContext, useContext, useRef, useState } from "react";
import type { PrimaryColor } from "@/lib/appearance";

const AppearanceContext = createContext<{
  primaryColor: PrimaryColor;
  saving: boolean;
  error: string | null;
  saved: boolean;
  chooseColor: (color: PrimaryColor) => Promise<void>;
} | null>(null);

export function AppearanceProvider({
  initialColor,
  children,
}: {
  initialColor: PrimaryColor;
  children: React.ReactNode;
}) {
  const [primaryColor, setPrimaryColor] = useState(initialColor);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  async function chooseColor(color: PrimaryColor) {
    if (pending.current || color === primaryColor) return;
    pending.current = true;
    const previous = primaryColor;
    setPrimaryColor(color);
    document.documentElement.dataset.primaryColor = color;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch("/api/settings/appearance", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ primaryColor: color }),
      });
      if (!response.ok) throw new Error("Could not save color.");
      setSaved(true);
    } catch {
      setPrimaryColor(previous);
      document.documentElement.dataset.primaryColor = previous;
      setError("Your color wasn’t saved. Try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <AppearanceContext
      value={{ primaryColor, saving, saved, error, chooseColor }}
    >
      {children}
    </AppearanceContext>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("AppearanceProvider is missing.");
  return context;
}
