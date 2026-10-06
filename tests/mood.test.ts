import { expect, test } from "bun:test";
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

test("related words come from the same family and skip excluded words", () => {
  const related = relatedFeelings("Anxious", new Set(["Worried"]));
  expect(related.length).toBeGreaterThan(0);
  const family = feelings.find((item) => item.word === "Anxious")?.family;
  expect(family).toBeDefined();
  for (const item of related) {
    expect(item.family).toBe(family ?? "");
    expect(item.word).not.toBe("Worried");
    expect(item.word).not.toBe("Anxious");
  }
  expect(relatedFeelings("Not a word", new Set())).toEqual([]);
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
