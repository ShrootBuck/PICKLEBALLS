import { expect, test } from "bun:test";
import { starterWords } from "@/lib/feeling-vocabulary";
import { browseFeelings, feelingPageSize } from "@/lib/feelings";
import {
  feelings,
  formatFeelings,
  impacts,
  journalPrompts,
  moodCheckInSchema,
  moodColor,
  moodLevelLabel,
  nearestFeelings,
  relatedFeelings,
  suggestedImpacts,
} from "@/lib/mood";

test("valence-only entries and long optional journals are valid", () => {
  expect(moodCheckInSchema.parse({ valence: 0 })).toEqual({
    valence: 0,
    feelings: [],
    impacts: [],
    journal: "",
  });
  expect(
    moodCheckInSchema.parse({
      valence: 90,
      feelings: ["Excited", "Joyful"],
      impacts: ["friends", "school"],
      journal: `  ${"x".repeat(5000)}  `,
    }).journal,
  ).toHaveLength(5000);
});

test("the slider splits into seven bands with neutral in the middle", () => {
  expect(moodLevelLabel(-100)).toBe("Very unpleasant");
  expect(moodLevelLabel(-15)).toBe("Slightly unpleasant");
  expect(moodLevelLabel(-14)).toBe("Neutral");
  expect(moodLevelLabel(0)).toBe("Neutral");
  expect(moodLevelLabel(14)).toBe("Neutral");
  expect(moodLevelLabel(15)).toBe("Slightly pleasant");
  expect(moodLevelLabel(100)).toBe("Very pleasant");
});

test("mood colors cover the whole scale", () => {
  expect(moodColor(-100)).toBe("oklch(0.640 0.190 300.0)");
  expect(moodColor(100)).toBe("oklch(0.800 0.170 60.0)");
  expect(moodColor(-500)).toBe(moodColor(-100));
  expect(moodColor(16.5)).toMatch(/^oklch\(0\.8\d+ 0\.1\d+ 1\d\d\.\d\)$/);
});

test("the vocabulary has unique words spread across the scale", () => {
  const words = feelings.map((item) => item.word);
  expect(new Set(words).size).toBe(words.length);
  for (const item of feelings) {
    expect(item.valence).toBeGreaterThanOrEqual(-100);
    expect(item.valence).toBeLessThanOrEqual(100);
  }
  for (const valence of [-100, -57, 0, 57, 100]) {
    const nearest = nearestFeelings(valence, 20);
    expect(nearest).toHaveLength(20);
    expect(
      nearest.every((item) => Math.abs(item.valence - valence) <= 40),
    ).toBe(true);
  }
});

test("related words cross families while skipping selected and excluded words", () => {
  const related = relatedFeelings("Anxious", new Set(["Worried"]));
  expect(related.map((item) => item.word)).toContain("Stressed");
  for (const item of related) {
    expect(item.word).not.toBe("Worried");
    expect(item.word).not.toBe("Anxious");
  }
  expect(relatedFeelings("Not a word", new Set())).toEqual([]);
});

test("devastated is discoverable from several relevant feelings", () => {
  for (const source of [
    "Heartbroken",
    "Sad",
    "Hopeless",
    "Grieving",
    "Disappointed",
    "Crushed",
  ]) {
    expect(
      relatedFeelings(source, new Set()).map((item) => item.word),
    ).toContain("Devastated");
  }
});

test("every feeling has reciprocal connections with no duplicates or self links", () => {
  const words = new Set(feelings.map((item) => item.word));
  const neighbors = new Map(
    feelings.map((item) => [
      item.word,
      new Set(
        relatedFeelings(item.word, new Set(), feelings.length).map(
          (item) => item.word,
        ),
      ),
    ]),
  );
  for (const [word, related] of neighbors) {
    expect(related.size).toBeGreaterThan(0);
    expect(related.has(word)).toBe(false);
    for (const neighbor of related) {
      expect(words.has(neighbor)).toBe(true);
      expect(neighbors.get(neighbor)?.has(word)).toBe(true);
    }
    expect(relatedFeelings(word, related)).toEqual([]);
  }
  expect(
    relatedFeelings("Exhausted", new Set(), feelings.length).map(
      (item) => item.word,
    ),
  ).not.toContain("Rested");
});

test("the bank holds short emotion words, not phrases", () => {
  expect(feelings.length).toBeLessThanOrEqual(400);
  for (const { word } of feelings)
    expect(word.split(" ").length).toBeLessThanOrEqual(2);
});

test("the bank starts with a small, diverse set of familiar words", () => {
  const familiar = new Set<string>(starterWords);
  for (const valence of [-100, -60, 0, 60, 100]) {
    const all = browseFeelings(valence);
    const first = all.slice(0, feelingPageSize);
    expect(first).toHaveLength(12);
    expect(first.every((item) => familiar.has(item.word))).toBe(true);
    expect(
      new Set(first.map((item) => item.family)).size,
    ).toBeGreaterThanOrEqual(6);
    expect(new Set(all.map((item) => item.word)).size).toBe(feelings.length);
    // Growing a page never reorders the earlier choices.
    expect(all.slice(0, feelingPageSize * 2).slice(0, feelingPageSize)).toEqual(
      first,
    );
  }
});

test("every word can save", () => {
  for (const item of feelings) {
    expect(
      moodCheckInSchema.safeParse({ valence: -100, feelings: [item.word] })
        .success,
    ).toBe(true);
    expect(suggestedImpacts([item.word])).toHaveLength(4);
  }
  // The slider never prevents someone from describing mixed feelings.
  expect(
    moodCheckInSchema.safeParse({
      valence: 100,
      feelings: ["Grieving", "Grateful", "Bittersweet"],
    }).success,
  ).toBe(true);
});

test("chosen words suggest likely impacts", () => {
  const ids = new Set<string>(impacts.map((impact) => impact.id));
  expect(suggestedImpacts([])).toEqual([]);
  const tired = suggestedImpacts(["Exhausted", "Drained"]);
  expect(tired[0]).toBe("sleep");
  expect(tired.every((id) => ids.has(id))).toBe(true);
});

test("journal prompts adapt to the check-in and only offered prompts save", () => {
  const input = {
    valence: -60,
    feelings: ["Stressed"],
    impacts: ["school"],
  };
  const prompts = journalPrompts(input);
  expect(prompts[0]).toBe("What about school is making you feel stressed?");
  for (const prompt of prompts)
    expect(moodCheckInSchema.safeParse({ ...input, prompt }).success).toBe(
      true,
    );
  expect(journalPrompts({ valence: 80, feelings: [], impacts: [] })).toContain(
    "Who or what are you grateful for right now?",
  );
  expect(
    moodCheckInSchema.safeParse({ ...input, prompt: "Anything I want" })
      .success,
  ).toBe(false);
  expect(
    moodCheckInSchema.safeParse({
      ...input,
      feelings: ["Calm"],
      prompt: prompts[0],
    }).success,
  ).toBe(false);
});

test("feelings read as a natural list", () => {
  expect(formatFeelings(["Grateful"])).toBe("Grateful");
  expect(formatFeelings(["Grateful", "Proud", "Cared for"])).toBe(
    "Grateful, proud, and cared for",
  );
});

test("invalid scales, unknown or duplicate choices, and oversized journals are rejected", () => {
  for (const input of [
    {},
    { valence: -101 },
    { valence: 101 },
    { valence: 1.5 },
    { valence: "3" },
    { mood: 3 },
    { valence: 0, feelings: ["Made up"] },
    { valence: 0, feelings: ["Calm", "Calm"] },
    { valence: 0, impacts: ["mars"] },
    { valence: 0, impacts: ["school", "school"] },
    { valence: 0, journal: "x".repeat(5001) },
    { valence: 0, circleId: "someone-elses-circle" },
  ])
    expect(moodCheckInSchema.safeParse(input).success).toBe(false);
});

test("check-ins accept optional media and reject invalid attachments", () => {
  const id = "i_00000000-0000-0000-0000-000000000001";
  expect(
    moodCheckInSchema.parse({ valence: 0, mediaIds: [id] }).mediaIds,
  ).toEqual([id]);
  for (const mediaIds of [
    [id, id],
    ["invalid"],
    Array.from(
      { length: 7 },
      (_, i) => `i_00000000-0000-0000-0000-00000000000${i}`,
    ),
  ]) {
    expect(moodCheckInSchema.safeParse({ valence: 0, mediaIds }).success).toBe(
      false,
    );
  }
});
