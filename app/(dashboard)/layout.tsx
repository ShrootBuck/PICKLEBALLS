import { Suspense } from "react";
import { BellSlot } from "@/components/layout/bell-slot";
import { SocialProvider } from "@/components/social/social-provider";
import { SocialShell } from "@/components/social/social-shell";
import { listMyCircles } from "@/lib/circles";
import { getPrisma } from "@/lib/prisma";
import { getPageSession, requirePageMembership } from "@/lib/request";
import { socialTaskInclude, toSocialTask } from "@/lib/social-data";
import { getStoryGroups } from "@/lib/story-data";
import { phoenixDateKey, requireDateKey } from "@/lib/time";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPageSession();
  if (!session)
    return <div className="min-h-full bg-background">{children}</div>;
  const { membership } = await requirePageMembership();
  const day = phoenixDateKey();
  // Stories can stream after the shell and the current page are usable.
  const stories = getStoryGroups(session.user.id, membership.circleId).catch(
    (error: unknown) => {
      console.error("Could not load stories", error);
      return null;
    },
  );
  const [memberships, tasks, pendingVerdicts] = await Promise.all([
    listMyCircles(session.user.id),
    getPrisma().commitment.findMany({
      where: {
        userId: session.user.id,
        circleId: membership.circleId,
        day: requireDateKey(day),
      },
      orderBy: { createdAt: "asc" },
      include: socialTaskInclude,
    }),
    getPrisma().taskProof.count({
      where: {
        circleId: membership.circleId,
        reviewStatus: "PENDING",
        replacedById: null,
        ownerId: { not: session.user.id },
        reviews: { none: { reviewerId: session.user.id } },
      },
    }),
  ]);
  const { id, name, image, initials } = membership.user;
  return (
    <SocialProvider
      key={`${id}:${membership.circleId}`}
      viewer={{ id, name, image, initials }}
      circleId={membership.circleId}
      day={day}
      tasks={tasks.map(toSocialTask)}
      initialStories={stories}
    >
      <SocialShell
        circles={memberships.map(({ circle, role }) => ({
          id: circle.id,
          name: circle.name,
          role,
        }))}
        pendingVerdicts={pendingVerdicts}
        bell={
          <Suspense fallback={null}>
            <BellSlot circleId={membership.circleId} userId={id} />
          </Suspense>
        }
      >
        {children}
      </SocialShell>
    </SocialProvider>
  );
}
