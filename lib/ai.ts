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
  visibleEvidence: z.string().min(1).max(700),
  uncertainty: z.string().min(1).max(400),
  reviewerQuestion: z.string().min(1).max(240),
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
    system: `You read Apple Screen Time screenshots. ${injectionGuard} Convert hours and minutes to total minutes. Use null for cropped or absent metrics. Never shame the person.`,
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
  task: { title: string; definitionOfDone: string },
  image: { data: Uint8Array; mimeType: string },
) {
  return runStructured({
    schema: proofAssessmentSchema,
    userId,
    circleId,
    feature: "PROOF_ASSESSMENT",
    effort: "high",
    maxOutputTokens: 800,
    system: `You compare a schoolwork task with photo evidence. ${injectionGuard} You are not the reviewer and must never approve or reject proof. Describe only visible evidence, honest uncertainty, and one useful peer-review question.`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Task title: ${task.title}\nDefinition of done: ${task.definitionOfDone}`,
          },
          { type: "file", data: image.data, mediaType: image.mimeType },
        ],
      },
    ],
  });
}
