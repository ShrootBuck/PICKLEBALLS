import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { BellSlot } from "@/components/layout/bell-slot";
import { MessageProvider } from "@/components/messages/message-provider";
import { SocialProvider } from "@/components/social/social-provider";
import { StreakCelebrationHost } from "@/components/streaks/streak-celebration";
import { countBucketVotesAwaiting } from "@/lib/bucket-list-data";
import { listMyCircles } from "@/lib/circles";
import { getPrisma } from "@/lib/prisma";
import { getPageSession, requirePageMembership } from "@/lib/request";
import {
  countProofsAwaitingVerdict,
  ownTaskInclude,
  toSocialTask,
} from "@/lib/social-data";
import { isSuperAdmin } from "@/lib/super-admin";
import { currentTaskFilter } from "@/lib/task-policy";
import { phoenixDateKey } from "@/lib/time";
import { getActiveWorkSession } from "@/lib/work-sessions";

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
  const [
    memberships,
    tasks,
    pendingVerdicts,
    bucketVotes,
    superAdmin,
    activeWorkSession,
  ] = await Promise.all([
    listMyCircles(session.user.id),
    getPrisma().commitment.findMany({
      where: {
        userId: session.user.id,
        circleId: membership.circleId,
        ...currentTaskFilter(),
      },
      orderBy: { createdAt: "asc" },
      include: ownTaskInclude,
    }),
    countProofsAwaitingVerdict(membership.circleId, session.user.id),
    countBucketVotesAwaiting(membership.circleId, session.user.id),
    isSuperAdmin(session.user.id),
    getActiveWorkSession(session.user.id),
  ]);
  const { id, name, image, initials } = membership.user;
  return (
    <MessageProvider key={id} userId={id}>
      <SocialProvider
        key={`${id}:${membership.circleId}`}
        viewer={{ id, name, image, initials }}
        circleId={membership.circleId}
        day={day}
        tasks={tasks.map(toSocialTask)}
        initialActiveWorkSession={activeWorkSession}
      >
        <AppShell
          circles={memberships.map(({ circle, role }) => ({
            id: circle.id,
            name: circle.name,
            role,
          }))}
          pendingVerdicts={pendingVerdicts}
          bucketVotes={bucketVotes}
          superAdmin={superAdmin}
          bell={
            <Suspense fallback={null}>
              <BellSlot circleId={membership.circleId} userId={id} />
            </Suspense>
          }
        >
          {children}
        </AppShell>
        <StreakCelebrationHost />
      </SocialProvider>
    </MessageProvider>
  );
}
