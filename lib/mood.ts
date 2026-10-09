import type { CSSProperties } from "react";
import { z } from "zod";
import { feelingFamilies } from "@/lib/feeling-vocabulary";
import { feelingByWord, feelings } from "@/lib/feelings";
import { mediaIdsSchema } from "@/lib/media-policy";

export const moodLevels = [
  "Very unpleasant",
  "Unpleasant",
  "Slightly unpleasant",
  "Neutral",
  "Slightly pleasant",
  "Pleasant",
  "Very pleasant",
] as const;
export type MoodTone = "unpleasant" | "neutral" | "pleasant";

/** Seven equal bands across -100 to 100, so 0 sits in the middle of Neutral. */
export function moodLevel(valence: number) {
  return Math.min(6, Math.max(0, Math.floor(((valence + 100) / 200) * 7)));
}

export function moodLevelLabel(valence: number) {
  return moodLevels[moodLevel(valence)];
}

export function moodTone(valence: number): MoodTone {
  const level = moodLevel(valence);
  return level < 3 ? "unpleasant" : level > 3 ? "pleasant" : "neutral";
}

const colorStops = [
  [-100, 0.64, 0.19, 300],
  [-66, 0.66, 0.17, 278],
  [-33, 0.72, 0.13, 252],
  [0, 0.8, 0.1, 220],
  [33, 0.85, 0.15, 155],
  [66, 0.87, 0.16, 95],
  [100, 0.8, 0.17, 60],
] as const;

export function moodColor(valence: number) {
  const v = Math.min(100, Math.max(-100, valence));
  const upper = colorStops.findIndex(([at]) => at >= v);
  const [a, b] = [colorStops[Math.max(0, upper - 1)], colorStops[upper]];
  const t = b[0] === a[0] ? 0 : (v - a[0]) / (b[0] - a[0]);
  const mix = (i: 1 | 2 | 3) => a[i] + (b[i] - a[i]) * t;
  return `oklch(${mix(1).toFixed(3)} ${mix(2).toFixed(3)} ${mix(3).toFixed(1)})`;
}

export function moodStyle(valence: number) {
  return { "--mood": moodColor(valence) } as CSSProperties;
}

const listFormat = new Intl.ListFormat("en-US", {
  style: "long",
  type: "conjunction",
});

/** "Grateful, proud, and connected" */
export function formatFeelings(words: readonly string[]) {
  return listFormat.format(
    words.map((word, index) => (index ? word.toLowerCase() : word)),
  );
}

export const moodGradient = `linear-gradient(to right, ${colorStops
  .map(([at]) => `${moodColor(at)} ${(at + 100) / 2}%`)
  .join(", ")})`;

export const impacts = [
  { id: "school", label: "School", topic: "school" },
  { id: "work", label: "Work", topic: "work" },
  { id: "tasks", label: "Tasks", topic: "your tasks" },
  { id: "friends", label: "Friends", topic: "your friends" },
  { id: "family", label: "Family", topic: "your family" },
  { id: "partner", label: "Partner", topic: "your partner" },
  { id: "dating", label: "Dating", topic: "dating" },
  { id: "community", label: "Community", topic: "your community" },
  { id: "health", label: "Health", topic: "your health" },
  { id: "fitness", label: "Fitness", topic: "your workouts" },
  { id: "sleep", label: "Sleep", topic: "sleep" },
  { id: "self-care", label: "Self-care", topic: "taking care of yourself" },
  { id: "hobbies", label: "Hobbies", topic: "your hobbies" },
  { id: "phone", label: "Phone", topic: "your phone" },
  { id: "money", label: "Money", topic: "money" },
  { id: "weather", label: "Weather", topic: "the weather" },
  { id: "travel", label: "Travel", topic: "travel" },
  { id: "news", label: "Current events", topic: "the news" },
  { id: "identity", label: "Identity", topic: "your identity" },
  { id: "spirituality", label: "Spirituality", topic: "your faith" },
] as const;
export type ImpactId = (typeof impacts)[number]["id"];
const impactById = new Map<string, (typeof impacts)[number]>(
  impacts.map((impact) => [impact.id, impact]),
);

export function impactDetails(id: string) {
  return impactById.get(id);
}

export { feelings, nearestFeelings, relatedFeelings } from "@/lib/feelings";

/** Impacts that usually go with the chosen words, most common first. */
export function suggestedImpacts(chosen: readonly string[], count = 4) {
  const score = new Map<ImpactId, number>();
  for (const word of chosen) {
    const family = feelingByWord.get(word)?.family;
    if (!family) continue;
    feelingFamilies[family].impacts.forEach((id, index) => {
      score.set(id, (score.get(id) ?? 0) + (4 - index));
    });
  }
  return impacts
    .filter((impact) => score.has(impact.id))
    .sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0))
    .slice(0, count)
    .map((impact) => impact.id);
}

/**
 * Journal prompts for a check-in, most specific first. The server accepts a
 * saved prompt only when this function would have offered it.
 */
export function journalPrompts(input: {
  valence: number;
  feelings: readonly string[];
  impacts: readonly string[];
}) {
  const tone = moodTone(input.valence);
  const feeling = input.feelings[0]?.toLowerCase();
  const topic = input.impacts[0] ? impactDetails(input.impacts[0])?.topic : "";
  const prompts: string[] = [];
  if (feeling && topic)
    prompts.push(
      tone === "pleasant"
        ? `What about ${topic} made you feel ${feeling}?`
        : tone === "unpleasant"
          ? `What about ${topic} is making you feel ${feeling}?`
          : `What’s on your mind about ${topic}?`,
    );
  if (feeling)
    prompts.push(
      tone === "unpleasant"
        ? `What’s behind feeling ${feeling}?`
        : `What made you feel ${feeling}?`,
    );
  if (topic && !feeling)
    prompts.push(
      tone === "unpleasant"
        ? `What’s going on with ${topic}?`
        : `What’s been happening with ${topic}?`,
    );
  prompts.push(
    ...{
      pleasant: [
        "What’s a moment from today you want to remember?",
        "Who or what are you grateful for right now?",
        "What went better than you expected?",
      ],
      neutral: [
        "What’s on your mind?",
        "What are you looking forward to?",
        "What would make today a little better?",
      ],
      unpleasant: [
        "What would make the next hour a little easier?",
        "What do you wish your circle knew right now?",
        "What’s one small thing you can do for yourself today?",
      ],
    }[tone],
  );
  return prompts;
}

function uniqueKnown(values: readonly string[], known: (v: string) => boolean) {
  return (
    new Set(values).size === values.length && values.every((v) => known(v))
  );
}

export const moodCheckInSchema = z
  .object({
    valence: z.number().int().min(-100).max(100),
    feelings: z.array(z.string().max(40)).max(feelings.length).default([]),
    impacts: z.array(z.string().max(40)).max(impacts.length).default([]),
    prompt: z.string().max(200).optional(),
    journal: z.string().trim().max(5000).default(""),
    mediaIds: mediaIdsSchema.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (!uniqueKnown(input.feelings, (word) => feelingByWord.has(word)))
      ctx.addIssue({
        code: "custom",
        path: ["feelings"],
        message: "Choose words from the list.",
      });
    if (!uniqueKnown(input.impacts, (id) => impactById.has(id)))
      ctx.addIssue({
        code: "custom",
        path: ["impacts"],
        message: "Choose impacts from the list.",
      });
    if (
      input.prompt !== undefined &&
      !journalPrompts(input).includes(input.prompt)
    )
      ctx.addIssue({
        code: "custom",
        path: ["prompt"],
        message: "Choose a suggested prompt.",
      });
  });
export type MoodCheckInInput = z.infer<typeof moodCheckInSchema>;
