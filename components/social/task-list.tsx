"use client";
import {
  ArrowUpRight,
  Camera,
  Check,
  Circle,
  Ellipsis,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DeleteAction } from "@/components/settings/delete-action";
import { useSocial } from "@/components/social/social-provider";
import { TaskDiscussion } from "@/components/social/task-discussion";
import {
  taskStatusLabel,
  taskStatusVariant,
} from "@/components/squad/proof-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { TaskStopwatch } from "@/components/work-sessions/task-stopwatch";
import { postHref } from "@/lib/navigation";
import type { SocialTask } from "@/lib/social-types";
import { canSubmitProof } from "@/lib/task-policy";
import { formatReplyTime } from "@/lib/time";

export function AddTaskButton() {
  const { openComposer } = useSocial();
  return (
    <Button size="sm" onClick={() => openComposer({ mode: "task" })}>
      <Plus data-icon="inline-start" /> Add task
    </Button>
  );
}

export function TaskProofButton({ task }: { task: SocialTask }) {
  const { openComposer } = useSocial();
  if (
    !canSubmitProof({
      ...task,
      dueAt: new Date(task.dueAt),
      proofSubmittedAt: task.proofSubmittedAt
        ? new Date(task.proofSubmittedAt)
        : null,
    }) ||
    (task.proof && task.proof.reviewStatus !== "CHALLENGED")
  )
    return null;
  return (
    <Button size="sm" onClick={() => openComposer({ mode: "proof", task })}>
      <Camera data-icon="inline-start" />
      {task.proof ? "Replace proof" : "Post proof"}
    </Button>
  );
}

function TaskMenu({ task, editable }: { task: SocialTask; editable: boolean }) {
  const { circleId, openComposer } = useSocial();
  const [cancelOpen, setCancelOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Options for ${task.title}`}
            />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuGroup>
            {editable && !task.proof && !task.proofSubmittedAt && (
              <DropdownMenuItem
                onClick={() => openComposer({ mode: "task", task })}
              >
                <Pencil /> Edit task
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setCancelOpen(true)}
            >
              <Trash2 /> Cancel task
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteAction
        label="Cancel task"
        title="Cancel this commitment?"
        description="The task stays in your history as Cancelled. Its proof, earlier proof versions, and proof discussions are permanently removed. Cancellation does not count as completing the task."
        endpoint={`/api/content/task/${task.id}`}
        body={{ circleId }}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        hideTrigger
      />
    </>
  );
}

export function TaskList({
  tasks,
  mine,
  historical = false,
  focusId,
}: {
  tasks: SocialTask[];
  mine: boolean;
  historical?: boolean;
  focusId?: string;
}) {
  const { circleId, openComposer } = useSocial();
  useEffect(() => {
    if (focusId)
      document
        .getElementById(`task-${focusId}`)
        ?.scrollIntoView({ block: "start" });
  }, [focusId]);
  return (
    <div className="flex flex-col">
      {tasks.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {historical
                ? "No tasks for this day"
                : mine
                  ? "A fresh start"
                  : "Nothing planned yet"}
            </EmptyTitle>
            <EmptyDescription>
              {historical
                ? "Choose another date or return to today."
                : mine
                  ? "Give today a finish line. Start with one task."
                  : "Their tasks will show up here when they add them."}
            </EmptyDescription>
          </EmptyHeader>
          {mine && !historical && (
            <Button onClick={() => openComposer({ mode: "task" })}>
              <Plus data-icon="inline-start" /> Add a task
            </Button>
          )}
        </Empty>
      )}
      {tasks.map((task) => {
        const editable =
          mine &&
          task.status !== "CANCELLED" &&
          task.status !== "VERIFIED" &&
          new Date(task.dueAt).getTime() > Date.now();
        return (
          <article
            key={task.id}
            id={`task-${task.id}`}
            className="social-task"
            data-focused={focusId === task.id || undefined}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-muted-foreground">
                {task.status === "VERIFIED" ? (
                  <Check className="size-5 text-success" />
                ) : (
                  <Circle className="size-5" />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <h3 className="text-base font-semibold leading-snug">
                  {task.proof ? (
                    <Link href={postHref(circleId, "proof", task.proof.id)}>
                      {task.title}
                    </Link>
                  ) : (
                    task.title
                  )}
                </h3>
                {task.goal && (
                  <Link
                    href={`/goals/${task.goal.id}`}
                    className="text-xs text-primary underline-offset-4 hover:underline"
                  >
                    {task.goal.title}
                  </Link>
                )}
                <p className="text-xs text-muted-foreground">
                  Proof due {formatReplyTime(task.dueAt)} · Phoenix time
                </p>
                <Badge
                  variant={
                    task.proof?.reviewStatus === "CHALLENGED"
                      ? "destructive"
                      : taskStatusVariant(task.status)
                  }
                  className="mt-1 w-fit"
                >
                  {task.proof?.reviewStatus === "CHALLENGED"
                    ? "Challenged"
                    : taskStatusLabel(task.status)}
                </Badge>
              </div>
              {mine &&
                !["VERIFIED", "MISSED", "CANCELLED"].includes(task.status) && (
                  <TaskMenu task={task} editable={editable} />
                )}
            </div>
            <div className="task-actions">
              {mine && (
                <div className="mr-auto">
                  <TaskStopwatch task={task} historical={historical} />
                </div>
              )}
              {task.proof && (
                <Button
                  nativeButton={false}
                  variant="ghost"
                  size="sm"
                  render={
                    <Link href={postHref(circleId, "proof", task.proof.id)} />
                  }
                >
                  <ArrowUpRight data-icon="inline-start" /> View proof
                </Button>
              )}
              {mine && <TaskProofButton task={task} />}
            </div>
            <TaskDiscussion
              taskId={task.id}
              title={task.title}
              focused={focusId === task.id}
            />
          </article>
        );
      })}
    </div>
  );
}
