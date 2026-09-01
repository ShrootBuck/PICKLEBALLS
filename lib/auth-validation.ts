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
  inviteToken: z
    .string()
    .trim()
    .min(32, "That invite link is broken.")
    .max(200, "That invite link is not valid."),
});

export const createInviteSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, "Say who this link is for.")
    .max(80, "Keep the label under 80 characters."),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
