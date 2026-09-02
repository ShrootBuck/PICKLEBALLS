import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { sanitizeImage } from "@/lib/image";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { receiptConfirmationSchema } from "@/lib/schemas";
import { DomainError } from "@/lib/tasks";
import { isValidCadencePeriod, parseDateKey } from "@/lib/time";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const form = await request.formData();
    let input: unknown;
    try {
      input = JSON.parse(String(form.get("receipt") ?? "null"));
    } catch {
      throw new DomainError("Receipt data is invalid.");
    }
    const parsed = receiptConfirmationSchema.safeParse(input);
    if (!parsed.success) throw new DomainError("Fix the receipt values.");
    const periodStart = parseDateKey(parsed.data.periodStart);
    const periodEnd = parseDateKey(parsed.data.periodEnd);
    if (!periodStart || !periodEnd || periodEnd < periodStart)
      throw new DomainError("The receipt period is invalid.");
    if (
      !isValidCadencePeriod(
        parsed.data.cadence,
        parsed.data.periodStart,
        parsed.data.periodEnd,
      )
    ) {
      throw new DomainError(
        parsed.data.cadence === "DAILY"
          ? "A daily receipt must cover one day."
          : "A weekly receipt must cover seven days.",
      );
    }
    const fileValue = form.get("image");
    const image =
      fileValue instanceof File && fileValue.size > 0
        ? await sanitizeImage(fileValue)
        : null;
    const values = parsed.data;
    const receipt = await getPrisma().screenTimeReceipt.upsert({
      where: {
        userId_circleId_cadence_periodStart: {
          userId: auth.session.user.id,
          circleId: auth.membership.circleId,
          cadence: values.cadence,
          periodStart,
        },
      },
      update: {
        periodEnd,
        dailyAverageMinutes: values.dailyAverageMinutes,
        totalScreenTimeMinutes: values.totalScreenTimeMinutes,
        socialMinutes: values.socialMinutes,
        pickups: values.pickups,
        comparisonPercent: values.comparisonPercent,
        topApps: values.topApps,
        aiSummary: values.summary,
        aiConfidence: values.confidence,
        aiWarnings: values.warnings,
        originalAIExtraction: values.originalAIExtraction ?? undefined,
        hasUserCorrections: values.hasUserCorrections,
        ...(image
          ? { image: { upsert: { create: image, update: image } } }
          : {}),
      },
      create: {
        userId: auth.session.user.id,
        circleId: auth.membership.circleId,
        cadence: values.cadence,
        periodStart,
        periodEnd,
        dailyAverageMinutes: values.dailyAverageMinutes,
        totalScreenTimeMinutes: values.totalScreenTimeMinutes,
        socialMinutes: values.socialMinutes,
        pickups: values.pickups,
        comparisonPercent: values.comparisonPercent,
        topApps: values.topApps,
        aiSummary: values.summary,
        aiConfidence: values.confidence,
        aiWarnings: values.warnings,
        originalAIExtraction: values.originalAIExtraction ?? undefined,
        hasUserCorrections: values.hasUserCorrections,
        ...(image ? { image: { create: image } } : {}),
      },
      include: { image: { select: { receiptId: true } } },
    });
    await getPrisma().activityEvent.create({
      data: {
        circleId: auth.membership.circleId,
        actorId: auth.session.user.id,
        kind: "SCREEN_TIME_SUBMITTED",
        entityId: receipt.id,
        summary: `posted a ${values.cadence.toLowerCase()} Screen Time receipt`,
      },
    });
    return NextResponse.json({
      receipt: {
        ...receipt,
        image: undefined,
        imageUrl: receipt.image
          ? `/api/screen-time/receipts/${receipt.id}/image`
          : null,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
