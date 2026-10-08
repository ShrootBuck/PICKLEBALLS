import { ArrowUpRight, CalendarDays, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GoalEditor } from "@/components/goals/goal-editor";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { milestoneProgress } from "@/lib/goal-policy";
import { getGoals } from "@/lib/goals";
import { requirePageMembership } from "@/lib/request";
import { formatDayShort, phoenixDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "Goals" };

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { session, membership } = await requirePageMembership();
  const { view: requested } = await searchParams;
  const view = ["circle", "completed", "archived"].includes(requested ?? "")
    ? requested
    : "mine";
  const all = await getGoals(membership.circleId, session.user.id);
  const goals = all.filter((goal) =>
    view === "completed"
      ? goal.status === "COMPLETED"
      : view === "archived"
        ? goal.status === "ARCHIVED"
        : goal.status === "ACTIVE" &&
          (view === "circle" || goal.userId === session.user.id),
  );
  return (
    <>
      <PageHeader
        title="Small steps. Bigger things."
        description="Give your daily work somewhere to go. Set a goal, mark the milestones, and keep the receipts."
        actions={<GoalEditor circleId={membership.circleId} />}
      >
        <Target className="size-4" />
        Long-term goals
      </PageHeader>
      <nav aria-label="Goal views" className="flex flex-wrap gap-2">
        {[
          ["mine", "My goals"],
          ["circle", "Circle goals"],
          ["completed", "Completed"],
          ["archived", "Archived"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/goals?view=${key}`}
            aria-current={view === key ? "page" : undefined}
            className={buttonVariants({
              variant: view === key ? "secondary" : "ghost",
              size: "sm",
            })}
          >
            {label}
          </Link>
        ))}
      </nav>
      {goals.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {goals.map((goal) => {
            const progress = milestoneProgress(goal.milestones);
            const target = goal.targetDate?.toISOString().slice(0, 10);
            return (
              <Card key={goal.id}>
                <CardHeader>
                  <div className="mb-2 flex items-center gap-2">
                    <Avatar size="sm">
                      <AvatarImage src={goal.user.image ?? undefined} alt="" />
                      <AvatarFallback>{goal.user.initials}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">
                      {goal.userId === session.user.id
                        ? "Your goal"
                        : goal.user.name}
                    </span>
                    {goal.status !== "ACTIVE" && (
                      <Badge
                        variant={
                          goal.status === "COMPLETED" ? "success" : "outline"
                        }
                      >
                        {goal.status === "COMPLETED" ? "Completed" : "Archived"}
                      </Badge>
                    )}
                  </div>
                  <CardTitle>
                    <Link
                      href={`/goals/${goal.id}`}
                      className="hover:underline underline-offset-4"
                    >
                      {goal.title}
                    </Link>
                  </CardTitle>
                  {goal.description && (
                    <CardDescription className="line-clamp-2">
                      {goal.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground">
                      {progress.total
                        ? `${progress.completed} of ${progress.total} milestones complete`
                        : "Milestones are yours to define"}
                    </p>
                    {progress.total > 0 && (
                      <Progress
                        value={progress.percent}
                        aria-label={`${progress.completed} of ${progress.total} milestones complete`}
                      />
                    )}
                    <p className="text-sm">
                      {goal._count.tasks} verified{" "}
                      {goal._count.tasks === 1 ? "task" : "tasks"}
                    </p>
                    {target && (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarDays className="size-3.5" />
                        {target < phoenixDateKey() && goal.status === "ACTIVE"
                          ? "Target was"
                          : "Aiming for"}{" "}
                        {formatDayShort(target)}, {target.slice(0, 4)}
                      </p>
                    )}
                  </div>
                </CardContent>
                <CardFooter>
                  <Link
                    href={`/goals/${goal.id}`}
                    className="flex w-full items-center justify-between gap-2 text-sm font-medium"
                  >
                    Follow the progress
                    <ArrowUpRight className="size-4" />
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Target />
            </EmptyMedia>
            <EmptyTitle>
              {view === "completed"
                ? "The finish lines are waiting"
                : view === "archived"
                  ? "No archived goals"
                  : "What would you love to finish?"}
            </EmptyTitle>
            <EmptyDescription>
              {view === "completed"
                ? "Completed goals stay here with their milestones and proof."
                : view === "archived"
                  ? "Goals you put aside stay here. Reopen them whenever you're ready."
                  : "A film, a fitness goal, a project you've been putting off. Start with something that matters to you."}
            </EmptyDescription>
          </EmptyHeader>
          {(view === "mine" || view === "circle") && (
            <GoalEditor circleId={membership.circleId} />
          )}
        </Empty>
      )}
    </>
  );
}
