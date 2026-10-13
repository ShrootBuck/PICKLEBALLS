"use client";

import { useSocial } from "@/components/social/social-provider";
import { AddTaskButton, TaskList } from "@/components/social/task-list";

export function TodayTasks({ focusId }: { focusId?: string }) {
  const { tasks } = useSocial();
  return (
    <section aria-labelledby="today-tasks" className="today-card">
      <div className="today-card-header">
        <div className="min-w-0">
          <h2 id="today-tasks" className="today-card-title">
            Your tasks
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Post proof within 24 hours of adding a task.
          </p>
        </div>
        {tasks.length > 0 && <AddTaskButton />}
      </div>
      <div className="px-4 md:px-5">
        <TaskList tasks={tasks} mine focusId={focusId} />
      </div>
    </section>
  );
}
