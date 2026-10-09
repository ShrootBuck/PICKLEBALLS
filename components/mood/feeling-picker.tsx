"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import {
  expandFeeling,
  type FeelingExpansions,
  visibleFeelings,
} from "@/lib/feelings";

export type FeelingPickerState = { expansions: FeelingExpansions };

export function newFeelingPickerState(): FeelingPickerState {
  return { expansions: {} };
}

export function FeelingPicker({
  base,
  chosen,
  onToggle,
  state,
  onStateChange,
}: {
  base: readonly string[];
  chosen: readonly string[];
  onToggle: (word: string) => void;
  state: FeelingPickerState;
  onStateChange: (state: FeelingPickerState) => void;
}) {
  const [announcement, setAnnouncement] = useState("");
  const visible = visibleFeelings(base, chosen, state.expansions);

  function toggle(word: string) {
    if (!chosen.includes(word)) {
      const expansions = expandFeeling(word, base, chosen, state.expansions);
      if (expansions !== state.expansions) {
        onStateChange({ ...state, expansions });
        const added = expansions[word] ?? [];
        setAnnouncement(
          added.length
            ? `${word} selected. Related words added after it: ${added.join(", ")}.`
            : `${word} selected.`,
        );
      } else setAnnouncement(`${word} selected.`);
    } else setAnnouncement(`${word} removed.`);
    onToggle(word);
  }

  return (
    <FieldSet>
      <FieldLegend className="sr-only">Feelings</FieldLegend>
      <div className="mood-chips">
        {visible.map(({ word, suggested }) => (
          <Toggle
            key={word}
            className="mood-chip mood-word-chip"
            data-suggested={suggested || undefined}
            pressed={chosen.includes(word)}
            onPressedChange={() => toggle(word)}
          >
            {word}
            <Check aria-hidden="true" />
          </Toggle>
        ))}
      </div>
      <output className="sr-only">{announcement}</output>
    </FieldSet>
  );
}
