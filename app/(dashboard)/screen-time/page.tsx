import type { Metadata } from "next";
import { ScreenTimeDashboard } from "@/components/screen-time/screen-time-dashboard";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";
import { cadencePeriod } from "@/lib/time";

export const metadata: Metadata = { title: "Screen Time" };

export default async function ScreenTimePage() {
  const { membership } = await requirePageMembership();
  const receipts = await getPrisma().screenTimeReceipt.findMany({
    where: { circleId: membership.circleId },
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: { user: true, image: { select: { receiptId: true } } },
  });
  return (
    <ScreenTimeDashboard
      periods={{
        DAILY: cadencePeriod("DAILY"),
        WEEKLY: cadencePeriod("WEEKLY"),
      }}
      receipts={receipts.map((receipt) => ({
        id: receipt.id,
        cadence: receipt.cadence,
        periodStart: receipt.periodStart.toISOString().slice(0, 10),
        periodEnd: receipt.periodEnd.toISOString().slice(0, 10),
        dailyAverageMinutes: receipt.dailyAverageMinutes,
        totalScreenTimeMinutes: receipt.totalScreenTimeMinutes,
        socialMinutes: receipt.socialMinutes,
        pickups: receipt.pickups,
        hasUserCorrections: receipt.hasUserCorrections,
        hasImage: Boolean(receipt.image),
        ownerName: receipt.user.name,
      }))}
    />
  );
}
