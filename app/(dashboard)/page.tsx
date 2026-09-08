import type { Metadata } from "next";
import { headers } from "next/headers";
import { LandingPage } from "@/components/landing/landing-page";
import { ScreenTimeReminder } from "@/components/screen-time/reminder";
import { Feed } from "@/components/social/feed";
import { HomeActions } from "@/components/social/home-actions";
import { MemberProgress } from "@/components/social/member-progress";
import { auth } from "@/lib/auth";
import { requirePageMembership } from "@/lib/request";
import { getFeedPage, getSocialMembers } from "@/lib/social-data";

export const metadata: Metadata = { title: "Home" };
export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return <LandingPage />;
  const { membership } = await requirePageMembership();
  const [feed, members] = await Promise.all([
    getFeedPage({ viewerId: session.user.id, circleId: membership.circleId }),
    getSocialMembers(membership.circleId),
  ]);
  return (
    <>
      <h1 className="sr-only">Home</h1>
      <MemberProgress
        members={members}
        viewerId={session.user.id}
        circleId={membership.circleId}
      />
      <HomeActions />
      <ScreenTimeReminder
        userId={session.user.id}
        circleId={membership.circleId}
      />
      <Feed initial={feed} />
    </>
  );
}
