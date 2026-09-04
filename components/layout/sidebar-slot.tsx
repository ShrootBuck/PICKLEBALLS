import { AppSidebar } from "@/components/app-sidebar";
import { getPrisma } from "@/lib/prisma";

export async function SidebarSlot({
  userId,
  circleId,
  isOwner,
  user,
  circles,
}: {
  userId: string;
  circleId: string;
  isOwner: boolean;
  user: { name: string; image: string | null; initials: string };
  circles: { id: string; name: string; role: "OWNER" | "MEMBER" }[];
}) {
  // Proofs waiting on this member's own vote: pending, not theirs,
  // and they have not voted yet.
  const pendingVerdicts = await getPrisma().taskProof.count({
    where: {
      circleId,
      reviewStatus: "PENDING",
      replacedById: null,
      ownerId: { not: userId },
      reviews: { none: { reviewerId: userId } },
    },
  });
  return (
    <AppSidebar
      isOwner={isOwner}
      pendingVerdicts={pendingVerdicts}
      user={user}
      activeCircleId={circleId}
      circles={circles}
    />
  );
}
