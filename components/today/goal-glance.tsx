import { ArrowRight, Plus, Target } from "lucide-react";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { milestoneProgress } from "@/lib/goal-policy";

export type GlanceGoal = {
  id: string;
  title: string;
  milestones: { completedAt: Date | null }[];
  verifiedTasks: number;
};

export function GoalGlance({ goals }: { goals: GlanceGoal[] }) {
  return (
    <section aria-labelledby="today-goals" className="today-card">
      <div className="today-card-header">
        <h2
          id="today-goals"
          className="today-card-title flex items-center gap-2"
        >
          <Target className="size-4 text-primary" />
          Goals
        </h2>
        <Link
          href="/goals"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          All goals
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {goals.length ? (
        <ul className="flex flex-col px-2 pb-2">
          {goals.map((goal) => {
            const progress = milestoneProgress(goal.milestones);
            return (
              <li key={goal.id}>
                <Link href={`/goals/${goal.id}`} className="goal-glance-row">
                  <span className="line-clamp-2 text-sm font-medium">
                    {goal.title}
                  </span>
                  {progress.total > 0 ? (
                    <Progress
                      value={progress.percent}
                      aria-label={`${progress.completed} of ${progress.total} milestones complete`}
                    />
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {progress.total
                      ? `${progress.completed} of ${progress.total} milestones`
                      : "No milestones yet"}
                    {" · "}
                    {goal.verifiedTasks} verified{" "}
                    {goal.verifiedTasks === 1 ? "task" : "tasks"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Link href="/goals" className="goal-glance-row mx-2 mb-2">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Plus className="size-4" /> Set a long-term goal
          </span>
        </Link>
      )}
    </section>
  );
}
