import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { ScreenTimeReminder } from "@/components/screen-time/reminder";
import { HomeActions } from "@/components/social/home-actions";
import { HomeFeed } from "@/components/social/home-feed";
import { MoodCheckIn } from "@/components/social/mood-check-in";
import { getPageSession, requirePageMembership } from "@/lib/request";
import { getFeedPage } from "@/lib/social-data";

export const metadata: Metadata = { title: "Home" };
export default async function HomePage() {
  const session = await getPageSession();
  if (!session) return <LandingPage />;
  const { membership } = await requirePageMembership();
  const context = { viewerId: session.user.id, circleId: membership.circleId };
  const [feed, pending] = await Promise.all([
    getFeedPage({ ...context, timelineOnly: true }),
    getFeedPage({ ...context, awaitingOnly: true }),
  ]);
  return (
    <>
      <h1 className="sr-only">Home</h1>
      <MoodCheckIn />
      <HomeActions />
      <ScreenTimeReminder
        userId={session.user.id}
        circleId={membership.circleId}
      />
      <HomeFeed timeline={feed} pending={pending} />
    </>
  );
}
