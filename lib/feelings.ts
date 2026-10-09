import {
  type FeelingFamily,
  feelingBridges,
  feelingFamilies,
  feelingNeighborhoods,
  starterWords,
} from "@/lib/feeling-vocabulary";

export type Feeling = { word: string; valence: number; family: FeelingFamily };
export const feelings: Feeling[] = Object.entries(feelingFamilies).flatMap(
  ([family, { words }]) =>
    words.map(([word, valence]) => ({
      word,
      valence,
      family: family as FeelingFamily,
    })),
);
export const feelingByWord = new Map(feelings.map((item) => [item.word, item]));
const starters = new Set<string>(starterWords);
export const feelingPageSize = 16;

function byCloseness(valence: number) {
  return (a: Feeling, b: Feeling) =>
    Math.abs(a.valence - valence) - Math.abs(b.valence - valence) ||
    a.word.localeCompare(b.word);
}

export function nearestFeelings(valence: number, count: number) {
  return [...feelings].sort(byCloseness(valence)).slice(0, Math.max(0, count));
}

/** Familiar entry points first, with variety instead of twenty near synonyms. */
export function browseFeelings(valence: number) {
  const remaining = [...feelings];
  const result: Feeling[] = [];
  const familyCounts = new Map<FeelingFamily, number>();
  // Make one stable ordering: asking for more only appends to the first page.
  while (remaining.length) {
    const introductory = result.length < feelingPageSize;
    const score = (item: Feeling) =>
      Math.abs(item.valence - valence) +
      (introductory && !starters.has(item.word) ? 60 : 0) +
      (familyCounts.get(item.family) ?? 0) * (introductory ? 12 : 3);
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      const delta = score(remaining[i]) - score(remaining[best]);
      if (
        delta < 0 ||
        (delta === 0 && remaining[i].word < remaining[best].word)
      )
        best = i;
    }
    const [next] = remaining.splice(best, 1);
    result.push(next);
    familyCounts.set(next.family, (familyCounts.get(next.family) ?? 0) + 1);
  }
  return result;
}

// A small in-memory weighted, undirected graph. Family links are a fallback;
// specific neighborhoods and bridges always rank ahead of them.
const graph = new Map<string, Map<string, number>>();
function connect(a: string, b: string, strength: number) {
  if (a === b) return;
  for (const [from, to] of [
    [a, b],
    [b, a],
  ]) {
    let edges = graph.get(from);
    if (!edges) {
      edges = new Map();
      graph.set(from, edges);
    }
    edges.set(to, Math.max(edges.get(to) ?? 0, strength));
  }
}
for (const { words } of Object.values(feelingFamilies)) {
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const [a, av] = words[i];
      const [b, bv] = words[j];
      // Sharing a family must not suggest opposites such as exhausted/rested.
      if (Math.abs(av - bv) <= 45 && (av * bv >= 0 || Math.abs(av - bv) <= 20))
        connect(a, b, 1);
    }
  }
}
for (const neighborhood of feelingNeighborhoods)
  for (let i = 0; i < neighborhood.length; i++)
    for (let j = i + 1; j < neighborhood.length; j++)
      connect(neighborhood[i], neighborhood[j], 3);
for (const [source, ...neighbors] of feelingBridges)
  for (const neighbor of neighbors) connect(source, neighbor, 4);

/** Semantic relevance first, then nearby intensity. Every connection is two-way. */
export function relatedFeelings(
  word: string,
  exclude: ReadonlySet<string>,
  count = 6,
) {
  const source = feelingByWord.get(word);
  if (!source) return [];
  return [...(graph.get(word) ?? [])]
    .filter(([neighbor]) => !exclude.has(neighbor))
    .flatMap(([neighbor, strength]) => {
      const feeling = feelingByWord.get(neighbor);
      return feeling
        ? [
            {
              feeling,
              score:
                strength * 100 - Math.abs(feeling.valence - source.valence),
            },
          ]
        : [];
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.feeling.word.localeCompare(b.feeling.word),
    )
    .slice(0, Math.max(0, count))
    .map(({ feeling }) => feeling);
}

/** Words a chosen feeling reveals, fixed when revealed so chips never reshuffle. */
export type FeelingExpansions = Readonly<Record<string, readonly string[]>>;
export type VisibleFeeling = { word: string; suggested: boolean };
export const revealedPerWord = 3;

// A group is open when its word is chosen or it revealed a chosen word, so walk
// upward from every chosen word through whatever revealed it.
function openFeelings(
  chosen: readonly string[],
  expansions: FeelingExpansions,
) {
  const revealedBy = new Map<string, string[]>();
  for (const [word, next] of Object.entries(expansions))
    for (const child of next)
      revealedBy.set(child, [...(revealedBy.get(child) ?? []), word]);
  const open = new Set<string>();
  const pending = [...chosen];
  for (let word = pending.pop(); word !== undefined; word = pending.pop()) {
    if (open.has(word)) continue;
    open.add(word);
    pending.push(...(revealedBy.get(word) ?? []));
  }
  return open;
}

/**
 * Lays out the starting words with each chosen word's direct neighbors right
 * after it. A revealed group stays open while its word or anything revealed
 * beneath it is chosen, so deselecting never hides a chosen word.
 */
export function visibleFeelings(
  base: readonly string[],
  chosen: readonly string[],
  expansions: FeelingExpansions,
) {
  const open = openFeelings(chosen, expansions);
  const shown = new Set<string>();
  const out: VisibleFeeling[] = [];
  const add = (word: string, suggested: boolean) => {
    if (shown.has(word) || !feelingByWord.has(word)) return;
    shown.add(word);
    out.push({ word, suggested });
    if (open.has(word))
      for (const next of expansions[word] ?? []) add(next, true);
  };
  for (const word of base) add(word, false);
  // Chosen words the current starting set no longer includes keep their place.
  for (const word of chosen) add(word, false);
  return out;
}

/** Reveals neighbors for a newly chosen word unless its group is already open. */
export function expandFeeling(
  word: string,
  base: readonly string[],
  chosen: readonly string[],
  expansions: FeelingExpansions,
): FeelingExpansions {
  // Still open because something it revealed is chosen: keep it as is.
  if (openFeelings(chosen, expansions).has(word)) return expansions;
  const shown = new Set(
    visibleFeelings(base, chosen, expansions).map((item) => item.word),
  );
  for (const item of chosen) shown.add(item);
  shown.add(word);
  const next = relatedFeelings(word, shown, revealedPerWord).map(
    (item) => item.word,
  );
  return { ...expansions, [word]: next };
}
