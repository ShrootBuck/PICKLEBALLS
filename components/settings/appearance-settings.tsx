"use client";

import { Check } from "lucide-react";
import { useAppearance } from "@/components/settings/appearance-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type PrimaryColor, primaryColors } from "@/lib/appearance";

export function AppearanceSettings() {
  const { primaryColor, saving, saved, error, chooseColor } = useAppearance();

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>A little more you. Same Pickle Balls.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldSet disabled={saving}>
          <FieldLegend id="primary-color-label">Primary color</FieldLegend>
          <FieldDescription id="primary-color-description">
            Pick the color for buttons, highlights, and focus rings.
          </FieldDescription>
          <ToggleGroup
            aria-labelledby="primary-color-label"
            aria-describedby="primary-color-description"
            variant="outline"
            size="lg"
            className="flex-wrap"
            value={[primaryColor]}
            onValueChange={(values) => {
              const color = values[0] as PrimaryColor | undefined;
              if (color) void chooseColor(color);
            }}
          >
            {Object.entries(primaryColors).map(([color, label]) => (
              <ToggleGroupItem
                key={color}
                value={color}
                aria-label={label}
                disabled={saving}
              >
                <span
                  data-primary-color={color}
                  aria-hidden="true"
                  className="size-4 shrink-0 rounded-full border border-foreground/20 bg-primary"
                />
                {label}
                {primaryColor === color ? (
                  <Check data-icon="inline-end" />
                ) : null}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldSet>
      </CardContent>
      <CardFooter>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <output className="text-sm text-muted-foreground">
            {saving
              ? "Saving…"
              : saved
                ? "Saved to your account."
                : "Saved to your account automatically. Applies on all your devices."}
          </output>
        )}
      </CardFooter>
    </Card>
  );
}
