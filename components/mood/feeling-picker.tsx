"use client";

import { Check } from "lucide-react";
import { useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import {
  type Feeling,
  feelings,
  feelingPageSize as pageSize,
  relatedFeelings,
  searchFeelings,
} from "@/lib/feelings";

const relatedPageSize = 6;

export type FeelingPickerState = {
  query: string;
  browseCount: number;
  searchCount: number;
  discovered: string[];
  relatedCount: number;
};

export function newFeelingPickerState(): FeelingPickerState {
  return {
    query: "",
    browseCount: pageSize,
    searchCount: pageSize,
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
  const input = useRef<HTMLInputElement>(null);
  const search = useMemo(() => searchFeelings(state.query), [state.query]);
  const searching = state.query.trim().length > 0;
  const base = browsing.slice(0, state.browseCount);
  const baseWords = new Set(base.map(({ word }) => word));
  const discovered = state.discovered.filter((word) => !baseWords.has(word));
  const visibleRelated = discovered.slice(0, state.relatedCount);
  const matches = searching ? search.feelings : browsing;
  const count = searching ? state.searchCount : state.browseCount;
  const visible = matches.slice(0, count);

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

  function clearSearch() {
    onStateChange({ ...state, query: "", searchCount: pageSize });
    input.current?.focus();
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
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="feeling-search" className="sr-only">
            Search feelings
          </FieldLabel>
          <Input
            ref={input}
            id="feeling-search"
            type="search"
            placeholder={`Search all ${feelings.length} feelings`}
            value={state.query}
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={searching ? "feeling-search-status" : undefined}
            onChange={(event) =>
              onStateChange({
                ...state,
                query: event.target.value,
                searchCount: pageSize,
              })
            }
            onKeyDown={(event) => {
              if (event.key === "Escape" && state.query) {
                event.preventDefault();
                event.stopPropagation();
                clearSearch();
              }
            }}
          />
        </Field>
      </FieldGroup>
      {searching && (
        <div className="flex items-center justify-between gap-2">
          <output
            id="feeling-search-status"
            className="text-sm text-muted-foreground"
          >
            {search.approximate
              ? "No exact matches. Similar spellings:"
              : `${matches.length} ${matches.length === 1 ? "match" : "matches"} across all feelings`}
          </output>
          <Button variant="ghost" size="sm" onClick={clearSearch}>
            Clear search
          </Button>
        </div>
      )}
      {visible.length > 0 ? (
        <FieldSet>
          <FieldLegend className="sr-only">
            {searching ? "Search results" : "Suggested feelings"}
          </FieldLegend>
          <div className="mood-chips">
            {chips(visible.map(({ word }) => word))}
          </div>
        </FieldSet>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No matching feelings</EmptyTitle>
            <EmptyDescription>
              Try another word or a shorter spelling. You can also clear your
              search and explore suggestions.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {!searching && discovered.length > 0 && (
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
      {(visible.length < matches.length || count > pageSize) && (
        <div className="flex flex-wrap gap-2">
          {visible.length < matches.length && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onStateChange(
                  searching
                    ? { ...state, searchCount: count + pageSize }
                    : { ...state, browseCount: count + pageSize },
                )
              }
            >
              {searching ? "Show more matches" : "Show more words"}
            </Button>
          )}
          {count > pageSize && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onStateChange(
                  searching
                    ? { ...state, searchCount: pageSize }
                    : { ...state, browseCount: pageSize },
                )
              }
            >
              Show fewer words
            </Button>
          )}
        </div>
      )}
      <output className="sr-only">
        {chosen.length} feelings selected.
        {!searching &&
          discovered.length > 0 &&
          ` ${visibleRelated.length} related words below the suggestions.`}
      </output>
    </div>
  );
}
