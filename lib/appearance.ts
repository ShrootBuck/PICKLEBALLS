import { z } from "zod";

export const primaryColors = {
  neutral: "Neutral",
  pink: "Pink",
  violet: "Violet",
  blue: "Blue",
  mint: "Mint",
  amber: "Amber",
} as const;

export type PrimaryColor = keyof typeof primaryColors;
export const primaryColorSchema = z.enum(
  Object.keys(primaryColors) as [PrimaryColor, ...PrimaryColor[]],
);
export const appearanceSchema = z
  .object({ primaryColor: primaryColorSchema })
  .strict();

export function parsePrimaryColor(value: unknown): PrimaryColor {
  const result = primaryColorSchema.safeParse(value);
  return result.success ? result.data : "neutral";
}
