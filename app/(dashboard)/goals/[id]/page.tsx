import { CalendarDays, Target } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GoalWorkspace } from "@/components/goals/goal-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { BackButton } from "@/components/social/back-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getGoal } from "@/lib/goals";
import { requirePageMembership } from "@/lib/request";
import { formatDayShort, phoenixDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "Goal" };
export default async function GoalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session, membership } = await requirePageMembership();
  const { id } = await params;
  if (id.length > 100) notFound();
  const goal = await getGoal(membership.circleId, id, session.user.id);
  if (!goal) notFound();
  const targetDate = goal.targetDate?.toISOString().slice(0, 10) ?? "";
  return (
    <>
      <BackButton />
      <PageHeader
        title={goal.title}
        description={goal.description ?? undefined}
      >
        <Target className="size-4" />
        Long-term goal
        <Badge variant={goal.status === "COMPLETED" ? "success" : "outline"}>
          {goal.status === "ACTIVE"
            ? "In progress"
            : goal.status === "COMPLETED"
              ? "Completed"
              : "Archived"}
        </Badge>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Avatar size="sm">
            <AvatarImage src={goal.user.image ?? undefined} alt="" />
            <AvatarFallback>{goal.user.initials}</AvatarFallback>
          </Avatar>
          {goal.user.name}
        </span>
        {targetDate && (
          <span className="flex items-center gap-2">
            <CalendarDays className="size-4" />
            Aiming for {formatDayShort(targetDate)}, {targetDate.slice(0, 4)}
          </span>
        )}
      </div>
      <GoalWorkspace
        circleId={membership.circleId}
        mine={goal.userId === session.user.id}
        goal={{
          id: goal.id,
          title: goal.title,
          description: goal.description,
          targetDate,
          status: goal.status,
          milestones: goal.milestones.map((item) => ({
            id: item.id,
            title: item.title,
            completedAt: item.completedAt
              ? phoenixDateKey(item.completedAt)
              : null,
          })),
          tasks: goal.tasks,
          available: goal.available,
        }}
      />
    </>
  );
}
