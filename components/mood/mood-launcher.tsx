"use client";

import { ChevronRight } from "lucide-react";
import { MoodShape } from "@/components/mood/mood-shape";
import { useSocial } from "@/components/social/social-provider";
import { Button } from "@/components/ui/button";
import { moodLevelLabel, moodStyle } from "@/lib/mood";

export function MoodLauncher({
  latest,
}: {
  latest: { valence: number; time: string } | null;
}) {
  const { openComposer } = useSocial();
  return (
    <Button
      variant="plain"
      className="mood-launcher"
      data-cycle={latest ? undefined : true}
      style={latest ? moodStyle(latest.valence) : undefined}
      onClick={() => openComposer({ mode: "check-in" })}
    >
      <MoodShape
        valence={latest?.valence ?? 0}
        className="size-13"
        tint={false}
        animate
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="mood-launcher-title">How are you feeling?</span>
        <span className="mood-launcher-meta">
          {latest
            ? `${moodLevelLabel(latest.valence)} at ${latest.time}. Check in again.`
            : "Check in with your circle."}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Button>
  );
}
