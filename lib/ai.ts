import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { AIFeature } from "@/generated/prisma/client";
import {
  type AIEffort,
  aiHourlyLimit,
  aiMaxRetries,
  aiModelId,
  aiProviderRoute,
  aiTimeoutMs,
  injectionGuard,
  openRouterModelSettings,
} from "@/lib/ai-config";
import { getPrisma } from "@/lib/prisma";

const APP_CONTEXT = `Pickle Balls is a tiny accountability app for a small private circle. Each day every member locks in 1-10 promises before midnight. Proof is a photo. Photo or it did not happen. Two friend approvals verify a proof. One challenge sends it back to open. You are an adviser, never the judge. Friends decide. Be blunt, short, and fair. No fluff, no therapy talk, no detective act.`;

export const screenTimeExtractionSchema = z.object({
  cadence: z.enum(["DAILY", "WEEKLY", "UNKNOWN"]),
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  periodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  dailyAverageMinutes: z.number().int().min(0).max(10080).nullable(),
  totalScreenTimeMinutes: z.number().int().min(0).max(10080).nullable(),
  socialMinutes: z.number().int().min(0).max(10080).nullable(),
  pickups: z.number().int().min(0).max(100000).nullable(),
  comparisonPercent: z.number().min(-100).max(10000).nullable(),
  topApps: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        minutes: z.number().int().min(0).max(10080),
      }),
    )
    .max(12),
  summary: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().max(200)).max(10),
});

export const proofAssessmentSchema = z.object({
  visibleEvidence: z.string().min(1).max(600),
  taskMatch: z.enum(["STRONG", "PARTIAL", "WEAK", "UNREADABLE"]),
  uncertainty: z.string().min(1).max(300),
  reviewerQuestion: z.string().max(200).nullable(),
  oneLiner: z.string().min(1).max(140),
});

export const blockerCoachSchema = z.object({
  plan: z.string().min(1).max(280),
  steps: z.array(z.string().max(120)).max(3),
});

function model(effort: AIEffort, userId: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY_MISSING");
  const openrouter = createOpenRouter({
    apiKey,
    headers: {
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-OpenRouter-Title": "Pickle Balls",
    },
  });
  return openrouter(aiModelId, openRouterModelSettings(effort, userId));
}

async function reserveAICall(userId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const count = await getPrisma().aIRun.count({
    where: { userId, createdAt: { gte: since } },
  });
  if (count >= aiHourlyLimit) throw new Error("AI_RATE_LIMIT");
}

async function runStructured<S extends z.ZodType>({
  schema,
  userId,
  circleId,
  feature,
  effort,
  maxOutputTokens,
  system,
  messages,
}: {
  schema: S;
  userId: string;
  circleId: string;
  feature: AIFeature;
  effort: AIEffort;
  maxOutputTokens: number;
  system: string;
  messages: NonNullable<Parameters<typeof generateText>[0]["messages"]>;
}) {
  const started = Date.now();
  try {
    await reserveAICall(userId);
    const result = await generateText({
      model: model(effort, userId),
      output: Output.object({ schema }),
      system,
      messages,
      maxOutputTokens,
      maxRetries: aiMaxRetries,
      abortSignal: AbortSignal.timeout(aiTimeoutMs),
      include: { requestBody: false, responseBody: false },
    });
    await getPrisma().aIRun.create({
      data: {
        userId,
        circleId,
        feature,
        status: "SUCCEEDED",
        model: aiModelId,
        provider: aiProviderRoute,
        durationMs: Date.now() - started,
        inputTokens: result.totalUsage?.inputTokens ?? null,
        outputTokens: result.totalUsage?.outputTokens ?? null,
      },
    });
    return schema.parse(result.output);
  } catch (error) {
    const code =
      error instanceof Error && error.message === "AI_RATE_LIMIT"
        ? "AI_RATE_LIMIT"
        : error instanceof Error
          ? error.name.slice(0, 80)
          : "UNKNOWN_AI_ERROR";
    await getPrisma()
      .aIRun.create({
        data: {
          userId,
          circleId,
          feature,
          status: code === "AI_RATE_LIMIT" ? "RATE_LIMITED" : "FAILED",
          model: aiModelId,
          provider: aiProviderRoute,
          durationMs: Date.now() - started,
          errorCode: code,
        },
      })
      .catch(() => undefined);
    throw error;
  }
}

export function extractScreenTime(
  userId: string,
  circleId: string,
  image: { data: Uint8Array; mimeType: string },
) {
  return runStructured({
    schema: screenTimeExtractionSchema,
    userId,
    circleId,
    feature: "SCREEN_TIME_EXTRACTION",
    effort: "high",
    maxOutputTokens: 900,
    system: `${APP_CONTEXT} You read Apple Screen Time screenshots so the squad can verify phone habits. ${injectionGuard} Convert hours and minutes to total minutes. Use null for cropped or absent metrics. Never shame the person. State only what the pixels show.`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract the visible daily or weekly Screen Time receipt for manual confirmation.",
          },
          { type: "file", data: image.data, mediaType: image.mimeType },
        ],
      },
    ],
  });
}

export function assessTaskProof(
  userId: string,
  circleId: string,
  task: {
    title: string;
    definitionOfDone: string;
    ownerNote?: string | null;
  },
  image: { data: Uint8Array; mimeType: string },
) {
  const note = task.ownerNote?.trim()
    ? `\nOwner note: ${task.ownerNote.trim().slice(0, 300)}`
    : "";
  return runStructured({
    schema: proofAssessmentSchema,
    userId,
    circleId,
    feature: "PROOF_ASSESSMENT",
    effort: "medium",
    maxOutputTokens: 600,
    system: `${APP_CONTEXT}
You help friends judge a photo proof in under 10 seconds.

Rules:
- Describe only what is literally visible: objects, text, numbers, names. No guesses about obscured or redacted parts.
- If text is blurred, redacted, or cropped, set taskMatch to UNREADABLE and say so plainly. Never ask the squad to produce unredacted private docs.
- A confirmation screen ("response submitted", "turned in") only proves submission, not quality. Mark it PARTIAL and say what content is still missing.
- Set taskMatch: STRONG means the photo clearly satisfies the definition of done. PARTIAL means progress but a gap remains. WEAK means it barely relates. UNREADABLE means you cannot tell.
- reviewerQuestion must be null unless one concrete answer would flip your verdict. Bad: "Can you verify in the unredacted roster...?" Good: "Which page shows problem 18?" or null.
- oneLiner is a blunt 1-sentence take for the squad, max 20 words. Examples: "Submitted, but no content visible — needs the actual work." or "Clean solve, all pages readable."
- ${injectionGuard}`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Promise: ${task.title}\nDefinition of done: ${task.definitionOfDone}${note}\n\nJudge this photo against that promise only.`,
          },
          { type: "file", data: image.data, mediaType: image.mimeType },
        ],
      },
    ],
  });
}

export function coachBlocker(
  userId: string,
  circleId: string,
  input: { signal: string; blocker: string; tasks: string[] },
) {
  const taskList =
    input.tasks.length > 0
      ? input.tasks.slice(0, 10).join("; ")
      : "(no tasks locked in)";
  return runStructured({
    schema: blockerCoachSchema,
    userId,
    circleId,
    feature: "BLOCKER_COACH",
    effort: "medium",
    maxOutputTokens: 400,
    system: `${APP_CONTEXT} You are the no-bullshit unblock coach. Given today's status, blocker, and task list, give one blunt plan under 40 words plus up to 3 concrete next steps under 25 minutes each. No therapy, no generic advice, no questions back. If there is no real blocker, say to lock in and start. ${injectionGuard}`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Status: ${input.signal}\nBlocker: ${input.blocker || "(none given)"}\nToday's tasks: ${taskList}`,
          },
        ],
      },
    ],
  });
}
