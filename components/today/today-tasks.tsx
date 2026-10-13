"use client";

import { useSocial } from "@/components/social/social-provider";
import { AddTaskButton, TaskList } from "@/components/social/task-list";

export function TodayTasks({ focusId }: { focusId?: string }) {
  const { tasks } = useSocial();
  const finished = tasks.filter((task) =>
    ["VERIFIED", "MISSED", "CANCELLED"].includes(task.status),
  );
  const current = tasks.filter((task) => !finished.includes(task));
  return (
    <section aria-labelledby="today-tasks" className="today-card today-work">
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
      <div className="today-task-list">
        {(current.length > 0 || tasks.length === 0) && (
          <TaskList tasks={current} mine focusId={focusId} />
        )}
        {finished.length > 0 && (
          <div className="today-finished">
            <h3 className="page-eyebrow">
              Wrapped up <span className="tabular-nums">{finished.length}</span>
            </h3>
            <TaskList tasks={finished} mine focusId={focusId} />
          </div>
        )}
      </div>
    </section>
  );
}
