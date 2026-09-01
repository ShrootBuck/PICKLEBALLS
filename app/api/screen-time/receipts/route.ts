import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getRollingWindow, pruneExpiredAppData } from "@/lib/rolling-retention";
import { screenTimeExtractionSchema } from "@/lib/screen-time";

export const runtime = "nodejs";

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxFileSize = 4 * 1024 * 1024;

function parseReportDate(value: string | null) {
  const date = value ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
    ? parsed
    : null;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  let extractionInput: unknown;
  try {
    extractionInput = JSON.parse(String(formData.get("extraction") ?? "null"));
  } catch {
    extractionInput = null;
  }
  const parsed = screenTimeExtractionSchema.safeParse(extractionInput);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "The receipt values are invalid." },
      { status: 400 },
    );
  }

  const imageValue = formData.get("image");
  const image =
    imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
  if (image && !acceptedImageTypes.has(image.type)) {
    return NextResponse.json(
      { error: "Use a PNG, JPEG, or WebP screenshot." },
      { status: 415 },
    );
  }
  if (image && image.size > maxFileSize) {
    return NextResponse.json(
      { error: "The screenshot must be smaller than 4 MB." },
      { status: 413 },
    );
  }

  const reportDate = parseReportDate(parsed.data.reportDate);
  if (!reportDate) {
    return NextResponse.json(
      { error: "The report date is invalid." },
      { status: 400 },
    );
  }

  const retention = getRollingWindow();
  if (reportDate < retention.cutoff) {
    return NextResponse.json(
      {
        error: `Receipts older than ${retention.days} days are outside the rolling window. Let the past die.`,
      },
      { status: 400 },
    );
  }

  await pruneExpiredAppData();

  const prisma = getPrisma();
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { circleId: true },
  });
  if (!membership) {
    return NextResponse.json(
      { error: "Your account is not attached to a squad." },
      { status: 409 },
    );
  }

  const imageData = image
    ? {
        data: new Uint8Array(await image.arrayBuffer()),
        mimeType: image.type,
        sizeBytes: image.size,
      }
    : null;
  const extraction = parsed.data;
  const metrics = {
    capturedAt: new Date(),
    view: extraction.view,
    dailyAverageMinutes: extraction.dailyAverageMinutes,
    totalScreenTimeMinutes: extraction.totalScreenTimeMinutes,
    socialMinutes: extraction.socialMinutes,
    pickups: extraction.pickups,
    comparisonPercent: extraction.comparisonPercent,
    topApps: extraction.topApps,
    aiSummary: extraction.summary,
    confidence: extraction.confidence,
    warnings: extraction.warnings,
    reviewStatus: "CONFIRMED" as const,
  };

  const receipt = await prisma.screenTimeReceipt.upsert({
    where: {
      userId_circleId_reportDate: {
        userId: session.user.id,
        circleId: membership.circleId,
        reportDate,
      },
    },
    update: {
      ...metrics,
      ...(imageData
        ? {
            image: {
              upsert: {
                create: imageData,
                update: imageData,
              },
            },
          }
        : {}),
    },
    create: {
      ...metrics,
      userId: session.user.id,
      circleId: membership.circleId,
      reportDate,
      ...(imageData ? { image: { create: imageData } } : {}),
    },
    select: {
      id: true,
      reportDate: true,
      view: true,
      dailyAverageMinutes: true,
      totalScreenTimeMinutes: true,
      socialMinutes: true,
      pickups: true,
      comparisonPercent: true,
      topApps: true,
      aiSummary: true,
      confidence: true,
      warnings: true,
      image: { select: { receiptId: true } },
    },
  });

  return NextResponse.json({
    receipt: {
      id: receipt.id,
      reportDate: receipt.reportDate.toISOString().slice(0, 10),
      view: receipt.view,
      dailyAverageMinutes: receipt.dailyAverageMinutes,
      totalScreenTimeMinutes: receipt.totalScreenTimeMinutes,
      socialMinutes: receipt.socialMinutes,
      pickups: receipt.pickups,
      comparisonPercent: receipt.comparisonPercent,
      topApps: receipt.topApps,
      summary: receipt.aiSummary,
      confidence: receipt.confidence,
      warnings: receipt.warnings,
      imageUrl: receipt.image
        ? `/api/screen-time/receipts/${receipt.id}/image`
        : null,
    },
  });
}
