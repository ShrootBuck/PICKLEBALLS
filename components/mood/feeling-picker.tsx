"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import {
  type Feeling,
  feelingPageSize as pageSize,
  relatedFeelings,
} from "@/lib/feelings";

const relatedPageSize = 6;

export type FeelingPickerState = {
  browseCount: number;
  discovered: string[];
  relatedCount: number;
};

export function newFeelingPickerState(): FeelingPickerState {
  return {
    browseCount: pageSize,
    discovered: [],
    relatedCount: relatedPageSize,
  };
}

export function FeelingPicker({
  browsing,
  chosen,
  onToggle,
  state,
  onStateChange,
}: {
  browsing: readonly Feeling[];
  chosen: readonly string[];
  onToggle: (word: string) => void;
  state: FeelingPickerState;
  onStateChange: (state: FeelingPickerState) => void;
}) {
  const visible = browsing.slice(0, state.browseCount);
  const baseWords = new Set(visible.map(({ word }) => word));
  const discovered = state.discovered.filter((word) => !baseWords.has(word));
  const visibleRelated = discovered.slice(0, state.relatedCount);

  function toggle(word: string) {
    if (!chosen.includes(word)) {
      const next = relatedFeelings(
        word,
        new Set([...baseWords, ...state.discovered, ...chosen]),
        relatedPageSize,
      ).map((item) => item.word);
      // Discovery appends once per tap. No recursive explosion, reshuffling,
      // or disappearing focused chips when a word is selected or deselected.
      onStateChange({
        ...state,
        discovered: [...state.discovered, ...next],
        relatedCount: Math.max(
          state.relatedCount,
          Math.min(12, discovered.length + next.length),
        ),
      });
    }
    onToggle(word);
  }

  function chips(words: readonly string[]) {
    return words.map((word) => (
      <Toggle
        key={word}
        className="mood-chip mood-word-chip"
        pressed={chosen.includes(word)}
        onPressedChange={() => toggle(word)}
      >
        {word}
        <Check aria-hidden="true" />
      </Toggle>
    ));
  }

  return (
    <div className="flex flex-col gap-5">
      <FieldSet>
        <FieldLegend className="sr-only">Suggested feelings</FieldLegend>
        <div className="mood-chips">
          {chips(visible.map(({ word }) => word))}
        </div>
      </FieldSet>
      {discovered.length > 0 && (
        <FieldSet id="mood-related-feelings">
          <FieldLegend variant="label">Related words</FieldLegend>
          <div className="mood-chips">{chips(visibleRelated)}</div>
          {visibleRelated.length < discovered.length && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() =>
                onStateChange({
                  ...state,
                  relatedCount: state.relatedCount + relatedPageSize,
                })
              }
            >
              More related words
            </Button>
          )}
        </FieldSet>
      )}
      {(visible.length < browsing.length || state.browseCount > pageSize) && (
        <div className="flex flex-wrap gap-2">
          {visible.length < browsing.length && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onStateChange({
                  ...state,
                  browseCount: state.browseCount + pageSize,
                })
              }
            >
              Show more words
            </Button>
          )}
          {state.browseCount > pageSize && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onStateChange({ ...state, browseCount: pageSize })}
            >
              Show fewer words
            </Button>
          )}
        </div>
      )}
      <output className="sr-only">
        {chosen.length} feelings selected.
        {discovered.length > 0 &&
          ` ${visibleRelated.length} related words below the suggestions.`}
      </output>
    </div>
  );
}
