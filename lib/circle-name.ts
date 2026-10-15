import { z } from "zod";

export const MAX_CIRCLE_NAME_LENGTH = 40;
export const circleNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_CIRCLE_NAME_LENGTH);
export const circleNameError = "Give your circle a name (1–40 characters).";
