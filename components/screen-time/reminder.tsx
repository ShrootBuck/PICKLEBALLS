import { Smartphone } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { getPrisma } from "@/lib/prisma";
import { latestScreenTimeWeek, screenTimeWeekLabel } from "@/lib/screen-time";
import { requireDateKey } from "@/lib/time";

export async function ScreenTimeReminder({
  userId,
  circleId,
}: {
  userId: string;
  circleId: string;
}) {
  const week = latestScreenTimeWeek();
  const submitted = await getPrisma().screenTimeSubmission.findUnique({
    where: {
      userId_circleId_weekStart: {
        userId,
        circleId,
        weekStart: requireDateKey(week),
      },
    },
    select: { id: true },
  });
  if (submitted) return null;
  return (
    <Alert>
      <Smartphone />
      <AlertTitle>Your weekly screen time is missing</AlertTitle>
      <AlertDescription>
        <p>
          Your {screenTimeWeekLabel(week)} entry is due. In Screen Time, choose
          Week, go back one week, and screenshot the average.
        </p>
        <Link
          className={buttonVariants({ size: "sm" })}
          href="/screen-time#upload"
        >
          Upload screen time
        </Link>
      </AlertDescription>
    </Alert>
  );
}
