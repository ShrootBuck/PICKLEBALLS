"use client";

import { ChevronDown } from "lucide-react";
import { TaskList } from "@/components/social/task-list";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { SocialTask } from "@/lib/social-types";
import { isCurrentDayTask } from "@/lib/task-policy";

export function CurrentTaskList({
  tasks,
  day,
  mine,
  focusId,
}: {
  tasks: SocialTask[];
  day: string;
  mine: boolean;
  focusId?: string;
}) {
  const now = new Date();
  const current = tasks.filter((task) => isCurrentDayTask(task, day, now));
  const unresolved = tasks.filter((task) => !isCurrentDayTask(task, day, now));
  const finished = current.filter((task) =>
    ["VERIFIED", "MISSED", "CANCELLED"].includes(task.status),
  );
  const active = current.filter((task) => !finished.includes(task));
  return (
    <div className="flex flex-col gap-4">
      {(active.length > 0 || current.length === 0) && (
        <TaskList tasks={active} mine={mine} focusId={focusId} />
      )}
      {finished.length > 0 && (
        <div className="today-finished">
          <h3 className="page-eyebrow">
            Wrapped up <span className="tabular-nums">{finished.length}</span>
          </h3>
          <TaskList tasks={finished} mine={mine} focusId={focusId} />
        </div>
      )}
      {unresolved.length > 0 && (
        <Collapsible
          key={focusId ?? "unresolved"}
          defaultOpen={unresolved.some((task) => task.id === focusId)}
        >
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                className="group w-full justify-between"
              />
            }
          >
            Unresolved · {unresolved.length}
            <ChevronDown
              data-icon="inline-end"
              className="transition-transform group-aria-expanded:rotate-180"
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Earlier tasks waiting for a verdict or replacement proof.
              Challenges with no activity for 7 days stay in History.
            </p>
            <TaskList tasks={unresolved} mine={mine} focusId={focusId} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
