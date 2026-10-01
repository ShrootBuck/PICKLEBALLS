import type { CSSProperties } from "react";
import { z } from "zod";
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

// Band centers for check-ins saved on the old five-point scale.
const legacyValence: Record<number, number> = {
  1: -86,
  2: -57,
  3: 0,
  4: 57,
  5: 86,
};

export function postValence(post: {
  valence?: number | null;
  mood?: number | null;
}) {
  if (post.valence != null) return post.valence;
  return post.mood == null ? null : (legacyValence[post.mood] ?? null);
}

/** Older releases read only the five-point mood. */
export function legacyMood(valence: number) {
  return [1, 2, 2, 3, 4, 4, 5][moodLevel(valence)];
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

// Families connect related words and hint at likely impacts. Values place each
// word on the same -100 to 100 scale as the slider.
const families: Record<
  string,
  { impacts: ImpactId[]; words: [string, number][] }
> = {
  despair: {
    impacts: ["school", "health", "identity", "work"],
    words: [
      ["Hopeless", -95],
      ["Helpless", -85],
      ["Defeated", -82],
      ["Powerless", -80],
      ["Empty", -70],
      ["Lost", -60],
      ["Discouraged", -52],
    ],
  },
  grief: {
    impacts: ["family", "friends", "partner", "dating"],
    words: [
      ["Devastated", -96],
      ["Heartbroken", -92],
      ["Grieving", -88],
      ["Homesick", -38],
    ],
  },
  sadness: {
    impacts: ["friends", "family", "partner", "school"],
    words: [
      ["Miserable", -90],
      ["Sad", -66],
      ["Hurt", -62],
      ["Disappointed", -50],
      ["Down", -46],
      ["Gloomy", -40],
      ["Sensitive", -24],
      ["Wistful", -10],
    ],
  },
  fear: {
    impacts: ["school", "health", "money", "news"],
    words: [
      ["Terrified", -92],
      ["Panicked", -86],
      ["Scared", -68],
      ["Anxious", -60],
      ["Worried", -48],
      ["Nervous", -35],
      ["Uneasy", -28],
    ],
  },
  anger: {
    impacts: ["friends", "family", "school", "work"],
    words: [
      ["Furious", -88],
      ["Disgusted", -72],
      ["Angry", -68],
      ["Resentful", -58],
      ["Frustrated", -55],
      ["Jealous", -50],
      ["Irritated", -38],
      ["Annoyed", -30],
    ],
  },
  shame: {
    impacts: ["identity", "friends", "school", "dating"],
    words: [
      ["Ashamed", -84],
      ["Guilty", -60],
      ["Embarrassed", -50],
      ["Insecure", -48],
      ["Self-conscious", -34],
      ["Awkward", -26],
    ],
  },
  stress: {
    impacts: ["school", "work", "tasks", "money"],
    words: [
      ["Overwhelmed", -76],
      ["Stressed", -58],
      ["Pressured", -42],
      ["Rushed", -32],
      ["Impatient", -26],
      ["Restless", -24],
      ["Busy", -6],
    ],
  },
  tiredness: {
    impacts: ["sleep", "health", "school", "fitness"],
    words: [
      ["Exhausted", -72],
      ["Burnt out", -68],
      ["Drained", -56],
      ["Tired", -32],
      ["Sluggish", -24],
      ["Sleepy", -10],
    ],
  },
  disconnection: {
    impacts: ["friends", "family", "community", "dating"],
    words: [
      ["Isolated", -80],
      ["Lonely", -74],
      ["Rejected", -70],
      ["Left out", -52],
      ["Withdrawn", -40],
      ["Disconnected", -36],
      ["Detached", -14],
    ],
  },
  flatness: {
    impacts: ["tasks", "phone", "hobbies", "school"],
    words: [
      ["Numb", -64],
      ["Apathetic", -40],
      ["Unmotivated", -30],
      ["Bored", -22],
      ["Indifferent", -6],
    ],
  },
  uncertainty: {
    impacts: ["school", "identity", "dating", "work"],
    words: [
      ["Confused", -28],
      ["Torn", -22],
      ["Distracted", -18],
      ["Uncertain", -16],
      ["Ambivalent", -6],
    ],
  },
  reflection: {
    impacts: ["identity", "spirituality", "family", "friends"],
    words: [
      ["Pensive", -2],
      ["Thoughtful", 4],
      ["Reflective", 4],
      ["Nostalgic", 6],
    ],
  },
  peace: {
    impacts: ["self-care", "sleep", "weather", "spirituality"],
    words: [
      ["Quiet", 0],
      ["Steady", 8],
      ["Calm", 10],
      ["Patient", 10],
      ["Content", 20],
      ["Grounded", 24],
      ["Comfortable", 26],
      ["Present", 26],
      ["Relaxed", 32],
      ["Relieved", 38],
      ["Peaceful", 40],
      ["Serene", 66],
      ["Free", 80],
      ["Blissful", 92],
    ],
  },
  wonder: {
    impacts: ["hobbies", "school", "travel", "news"],
    words: [
      ["Curious", 14],
      ["Interested", 22],
      ["Intrigued", 30],
      ["Fascinated", 58],
      ["Amazed", 82],
      ["Awed", 86],
    ],
  },
  drive: {
    impacts: ["school", "work", "fitness", "tasks"],
    words: [
      ["Focused", 12],
      ["Productive", 34],
      ["Determined", 44],
      ["Motivated", 52],
      ["Passionate", 74],
      ["Unstoppable", 90],
    ],
  },
  hope: {
    impacts: ["school", "work", "identity", "spirituality"],
    words: [
      ["Hopeful", 30],
      ["Encouraged", 36],
      ["Optimistic", 50],
    ],
  },
  pride: {
    impacts: ["school", "work", "fitness", "tasks"],
    words: [
      ["Satisfied", 38],
      ["Capable", 40],
      ["Brave", 50],
      ["Confident", 56],
      ["Proud", 60],
      ["Accomplished", 64],
      ["Fulfilled", 76],
      ["Empowered", 80],
    ],
  },
  love: {
    impacts: ["friends", "family", "partner", "community"],
    words: [
      ["Included", 40],
      ["Connected", 54],
      ["Supported", 54],
      ["Appreciated", 56],
      ["Grateful", 56],
      ["Cared for", 60],
      ["Loved", 68],
    ],
  },
  joy: {
    impacts: ["friends", "hobbies", "weather", "travel"],
    words: [
      ["Silly", 44],
      ["Amused", 48],
      ["Playful", 54],
      ["Cheerful", 58],
      ["Happy", 62],
      ["Delighted", 80],
      ["Joyful", 82],
      ["Radiant", 86],
      ["Elated", 90],
      ["Overjoyed", 92],
      ["Ecstatic", 96],
      ["Euphoric", 97],
    ],
  },
  energy: {
    impacts: ["fitness", "hobbies", "travel", "friends"],
    words: [
      ["Refreshed", 34],
      ["Creative", 52],
      ["Energized", 62],
      ["Inspired", 64],
      ["Adventurous", 74],
      ["Excited", 78],
      ["Hyped", 86],
      ["Thrilled", 88],
    ],
  },
};

export type Feeling = { word: string; valence: number; family: string };
export const feelings: Feeling[] = Object.entries(families).flatMap(
  ([family, { words }]) =>
    words.map(([word, valence]) => ({ word, valence, family })),
);
const feelingByWord = new Map(feelings.map((item) => [item.word, item]));

function byCloseness(valence: number) {
  return (a: Feeling, b: Feeling) =>
    Math.abs(a.valence - valence) - Math.abs(b.valence - valence) ||
    a.word.localeCompare(b.word);
}

/** The words that best fit a slider position, closest first. */
export function nearestFeelings(valence: number, count: number) {
  return [...feelings].sort(byCloseness(valence)).slice(0, count);
}

/** Words from the same family as `word`, closest in intensity first. */
export function relatedFeelings(
  word: string,
  exclude: ReadonlySet<string>,
  count = 3,
) {
  const source = feelingByWord.get(word);
  if (!source) return [];
  return feelings
    .filter(
      (item) =>
        item.family === source.family &&
        item.word !== word &&
        !exclude.has(item.word),
    )
    .sort(byCloseness(source.valence))
    .slice(0, count);
}

/** Impacts that usually go with the chosen words, most common first. */
export function suggestedImpacts(chosen: readonly string[], count = 4) {
  const score = new Map<ImpactId, number>();
  for (const word of chosen) {
    const family = feelingByWord.get(word)?.family;
    if (!family) continue;
    families[family].impacts.forEach((id, index) => {
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
