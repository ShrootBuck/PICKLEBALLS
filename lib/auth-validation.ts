import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Use a real email address.").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password."),
});

export const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Use at least two characters.")
    .max(80, "Keep the name under 80 characters."),
  email: z.email("Use a real email address.").trim().toLowerCase(),
  password: z
    .string()
    .min(12, "Use at least 12 characters. Yes, twelve.")
    .max(128, "Keep the password under 128 characters."),
  inviteCode: z
    .string()
    .trim()
    .min(1, "Get the squad code from whoever invited you.")
    .max(80, "That invite code is not valid."),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
