import { expect, test } from "bun:test";
import { moodCheckInSchema, moods } from "@/lib/mood";

test("mood-only entries and long optional journals are valid", () => {
  expect(moodCheckInSchema.parse({ mood: 3 })).toEqual({
    mood: 3,
    feelings: [],
    journal: "",
  });
  expect(
    moodCheckInSchema.parse({
      mood: 5,
      feelings: ["Excited", "Joyful"],
      journal: `  ${"x".repeat(5000)}  `,
    }).journal,
  ).toHaveLength(5000);
});

test("each mood offers exactly 33 words and accepts every offered word", () => {
  for (const mood of moods) {
    expect(mood.feelings).toHaveLength(33);
    expect(
      moodCheckInSchema.safeParse({
        mood: mood.value,
        feelings: [...mood.feelings],
      }).success,
    ).toBe(true);
  }
});

test("invalid moods, mismatched or duplicate feelings, and oversized journals are rejected", () => {
  for (const input of [
    { mood: 0 },
    { mood: 6 },
    { mood: 1.5 },
    { mood: "3" },
    { mood: 1, feelings: ["Excited"] },
    { mood: 5, feelings: ["Excited", "Excited"] },
    { mood: 3, journal: "x".repeat(5001) },
    { mood: 3, circleId: "someone-elses-circle" },
  ])
    expect(moodCheckInSchema.safeParse(input).success).toBe(false);
});

test("check-ins accept optional media and reject invalid attachments", () => {
  const id = "i_00000000-0000-0000-0000-000000000001";
  expect(moodCheckInSchema.parse({ mood: 3, mediaIds: [id] }).mediaIds).toEqual(
    [id],
  );
  for (const mediaIds of [
    [id, id],
    ["invalid"],
    Array.from(
      { length: 7 },
      (_, i) => `i_00000000-0000-0000-0000-00000000000${i}`,
    ),
  ]) {
    expect(moodCheckInSchema.safeParse({ mood: 3, mediaIds }).success).toBe(
      false,
    );
  }
});
