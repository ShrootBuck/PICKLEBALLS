import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/invites";
import { getPrisma } from "@/lib/prisma";
import { pruneExpiredAppData } from "@/lib/rolling-retention";
import { storedScreenTimeReceiptSchema } from "@/lib/screen-time";
import PickleBallsApp from "./pickle-balls-app";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  await pruneExpiredAppData();
  const latestReceipt = await getPrisma().screenTimeReceipt.findFirst({
    where: { userId: session.user.id, reviewStatus: "CONFIRMED" },
    orderBy: { reportDate: "desc" },
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
  const parsedReceipt = latestReceipt
    ? storedScreenTimeReceiptSchema.safeParse({
        id: latestReceipt.id,
        reportDate: latestReceipt.reportDate.toISOString().slice(0, 10),
        view: latestReceipt.view,
        dailyAverageMinutes: latestReceipt.dailyAverageMinutes,
        totalScreenTimeMinutes: latestReceipt.totalScreenTimeMinutes,
        socialMinutes: latestReceipt.socialMinutes,
        pickups: latestReceipt.pickups,
        comparisonPercent: latestReceipt.comparisonPercent,
        topApps: latestReceipt.topApps,
        summary: latestReceipt.aiSummary,
        confidence: latestReceipt.confidence,
        warnings: latestReceipt.warnings,
        imageUrl: latestReceipt.image
          ? `/api/screen-time/receipts/${latestReceipt.id}/image`
          : null,
      })
    : null;

  return (
    <PickleBallsApp
      initialReceipt={parsedReceipt?.success ? parsedReceipt.data : null}
      currentUser={{
        name: session.user.name,
        email: session.user.email,
        initials: session.user.initials ?? initials(session.user.name) ?? "PB",
        isAdmin: isAdminEmail(session.user.email),
      }}
    />
  );
}
