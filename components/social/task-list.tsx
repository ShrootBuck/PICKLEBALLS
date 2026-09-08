"use client";
import {
  ArrowUpRight,
  Camera,
  Check,
  Circle,
  Pencil,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useSocial } from "@/components/social/social-provider";
import { TaskDiscussion } from "@/components/social/task-discussion";
import {
  taskStatusLabel,
  taskStatusVariant,
} from "@/components/squad/proof-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { postHref } from "@/lib/navigation";
import type { SocialTask } from "@/lib/social-types";

export function TaskList({
  tasks,
  mine,
  focusId,
}: {
  tasks: SocialTask[];
  mine: boolean;
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
              {mine ? "A fresh start" : "Nothing planned yet"}
            </EmptyTitle>
            <EmptyDescription>
              {mine
                ? "Give today a finish line. Start with one task."
                : "Their tasks will show up here when they add them."}
            </EmptyDescription>
          </EmptyHeader>
          {mine && (
            <Button onClick={() => openComposer({ mode: "task" })}>
              <Plus data-icon="inline-start" /> Add a task
            </Button>
          )}
        </Empty>
      )}
      {tasks.map((task) => {
        const editable = mine && new Date(task.dueAt).getTime() > Date.now();
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
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {task.definitionOfDone}
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
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {editable && !task.proof && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openComposer({ mode: "task", task })}
                >
                  <Pencil data-icon="inline-start" /> Edit
                </Button>
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
              {editable &&
                (!task.proof || task.proof.reviewStatus === "CHALLENGED") && (
                  <Button
                    size="sm"
                    onClick={() => openComposer({ mode: "proof", task })}
                  >
                    <Camera data-icon="inline-start" />
                    {task.proof ? "Replace proof" : "Post proof"}
                  </Button>
                )}
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
