import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { MoodLauncher } from "@/components/mood/mood-launcher";
import { ScreenTimeReminder } from "@/components/screen-time/reminder";
import { HomeActions } from "@/components/social/home-actions";
import { HomeFeed } from "@/components/social/home-feed";
import { postValence } from "@/lib/mood";
import { getPrisma } from "@/lib/prisma";
import { getPageSession, requirePageMembership } from "@/lib/request";
import { getFeedPage } from "@/lib/social-data";
import { formatHistoryTime, phoenixDateKey, requireDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "Home" };
export default async function HomePage() {
  const session = await getPageSession();
  if (!session) return <LandingPage />;
  const { membership } = await requirePageMembership();
  const context = { viewerId: session.user.id, circleId: membership.circleId };
  const [feed, pending, latest] = await Promise.all([
    getFeedPage({ ...context, timelineOnly: true }),
    getFeedPage({ ...context, awaitingOnly: true }),
    getPrisma().checkInUpdate.findFirst({
      where: {
        userId: session.user.id,
        circleId: membership.circleId,
        day: requireDateKey(phoenixDateKey()),
        OR: [{ valence: { not: null } }, { mood: { not: null } }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { mood: true, valence: true, createdAt: true },
    }),
  ]);
  const latestValence = latest ? postValence(latest) : null;
  return (
    <>
      <h1 className="sr-only">Home</h1>
      <MoodLauncher
        latest={
          latest && latestValence != null
            ? {
                valence: latestValence,
                time: formatHistoryTime(latest.createdAt),
              }
            : null
        }
      />
      <HomeActions />
      <ScreenTimeReminder
        userId={session.user.id}
        circleId={membership.circleId}
      />
      <HomeFeed timeline={feed} pending={pending} />
    </>
  );
}
