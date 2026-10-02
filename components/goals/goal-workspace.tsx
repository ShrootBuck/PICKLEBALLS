"use client";

import {
  Archive,
  Check,
  Link2,
  Plus,
  RotateCcw,
  Trash2,
  Unlink,
} from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { GoalEditor, saveGoalAction } from "@/components/goals/goal-editor";
import { PageSection } from "@/components/layout/page-header";
import { useSocial } from "@/components/social/social-provider";
import { TaskList } from "@/components/social/task-list";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { milestoneProgress } from "@/lib/goal-policy";
import type { SocialTask } from "@/lib/social-types";
import { formatDayShort } from "@/lib/time";

type GoalDetail = {
  id: string;
  title: string;
  description: string | null;
  targetDate: string;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  milestones: { id: string; title: string; completedAt: string | null }[];
  tasks: SocialTask[];
  available: { id: string; title: string; status: string }[];
};

export function GoalWorkspace({
  goal,
  mine,
  circleId,
}: {
  goal: GoalDetail;
  mine: boolean;
  circleId: string;
}) {
  const inputId = useId();
  const { openComposer } = useSocial();
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [search, setSearch] = useState("");
  const progress = milestoneProgress(goal.milestones);
  const editable = mine && goal.status === "ACTIVE";
  async function act(action: unknown, success?: string) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      await saveGoalAction(goal.id, action);
      if (success) toast.add({ title: success, type: "success" });
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save. Try again.",
      );
      return false;
    } finally {
      setPending(false);
    }
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    if (await act({ action: "addMilestone", title })) setTitle("");
  }
  return (
    <div className="flex flex-col gap-8">
      {mine && (
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <>
              <GoalEditor circleId={circleId} goal={goal} />
              <Button
                size="sm"
                disabled={pending || progress.completed !== progress.total}
                onClick={() =>
                  act(
                    { action: "status", status: "COMPLETED" },
                    "Goal complete. Look how far you came.",
                  )
                }
              >
                <Check data-icon="inline-start" />
                Complete goal
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  act(
                    { action: "status", status: "ARCHIVED" },
                    "Goal archived. You can reopen it anytime.",
                  )
                }
              >
                <Archive data-icon="inline-start" />
                Archive
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                act({ action: "status", status: "ACTIVE" }, "Goal reopened.")
              }
            >
              <RotateCcw data-icon="inline-start" />
              Reopen goal
            </Button>
          )}
          {pending && <Spinner aria-label="Saving goal" />}
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <PageSection
          title="The milestones"
          description="Marked complete by the person working on the goal. Linked task proof is reviewed separately."
        >
          {progress.total > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {progress.completed} of {progress.total} milestones complete
              </p>
              <Progress
                value={progress.percent}
                aria-label={`${progress.completed} of ${progress.total} milestones complete`}
              />
            </div>
          )}
          <ul className="flex flex-col divide-y divide-border">
            {goal.milestones.map((item, index) => (
              <li key={item.id} className="flex items-start gap-3 py-4">
                <Checkbox
                  id={`milestone-${item.id}`}
                  checked={Boolean(item.completedAt)}
                  disabled={!editable || pending}
                  onCheckedChange={(completed) =>
                    act({
                      action: "milestone",
                      milestoneId: item.id,
                      completed: Boolean(completed),
                    })
                  }
                  aria-label={`Complete milestone: ${item.title}`}
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`milestone-${item.id}`}
                    className="block break-words text-sm font-medium"
                  >
                    {item.title}
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.completedAt
                      ? `Completed ${formatDayShort(item.completedAt)}`
                      : `Step ${index + 1}`}
                  </p>
                </div>
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    aria-label={`Remove milestone: ${item.title}`}
                    onClick={() =>
                      act({ action: "removeMilestone", milestoneId: item.id })
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {!progress.total && (
            <p className="py-3 text-sm text-muted-foreground">
              Break the goal into a few meaningful steps. A finished milestone
              is a win of its own.
            </p>
          )}
          {editable && progress.total < 20 && (
            <form onSubmit={add}>
              <FieldGroup>
                <Field data-disabled={pending}>
                  <FieldLabel htmlFor={inputId}>Next milestone</FieldLabel>
                  <Input
                    id={inputId}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={160}
                    required
                    placeholder="What is the next real step?"
                    disabled={pending}
                  />
                </Field>
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={pending || !title.trim()}
                >
                  <Plus data-icon="inline-start" />
                  Add milestone
                </Button>
              </FieldGroup>
            </form>
          )}
        </PageSection>
        <PageSection
          title="The work behind it"
          description={`${goal.tasks.filter((task) => task.status === "VERIFIED").length} verified of ${goal.tasks.length} linked tasks.`}
          action={
            editable && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    openComposer({
                      mode: "task",
                      goal: { id: goal.id, title: goal.title },
                    })
                  }
                >
                  <Plus data-icon="inline-start" />
                  Add a task
                </Button>
                <Dialog
                  open={linkOpen}
                  onOpenChange={(next) => {
                    if (!pending) {
                      setLinkOpen(next);
                      setSearch("");
                    }
                  }}
                >
                  <DialogTrigger
                    render={<Button size="sm" variant="outline" />}
                  >
                    <Link2 data-icon="inline-start" />
                    Link existing
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Link a task to this goal</DialogTitle>
                      <DialogDescription>
                        Your 100 most recent unlinked tasks. Their proof and
                        deadlines stay with them.
                      </DialogDescription>
                    </DialogHeader>
                    <Field>
                      <FieldLabel htmlFor={`${inputId}-search`}>
                        Find a task
                      </FieldLabel>
                      <Input
                        id={`${inputId}-search`}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search your tasks"
                      />
                    </Field>
                    <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                      {goal.available
                        .filter((task) =>
                          task.title
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((task) => (
                          <Button
                            key={task.id}
                            variant="outline"
                            className="h-auto justify-start whitespace-normal py-3 text-left"
                            disabled={pending}
                            onClick={async () => {
                              if (
                                await act(
                                  { action: "linkTask", taskId: task.id },
                                  "Task linked.",
                                )
                              )
                                setLinkOpen(false);
                            }}
                          >
                            <Link2 data-icon="inline-start" />
                            {task.title}
                          </Button>
                        ))}
                      {!goal.available.some((task) =>
                        task.title.toLowerCase().includes(search.toLowerCase()),
                      ) && (
                        <p className="py-4 text-sm text-muted-foreground">
                          No matching tasks. Add a new task from this goal.
                        </p>
                      )}
                    </div>
                    {error && (
                      <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            )
          }
        >
          {goal.tasks.length ? (
            goal.tasks.map((task) => (
              <div key={task.id}>
                <TaskList tasks={[task]} mine={mine} />
                {editable && (
                  <div className="flex justify-end pb-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        act(
                          { action: "unlinkTask", taskId: task.id },
                          "Task unlinked. Its history is still saved.",
                        )
                      }
                    >
                      <Unlink data-icon="inline-start" />
                      Unlink from goal
                    </Button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>The first step starts here</EmptyTitle>
                <EmptyDescription>
                  {mine
                    ? "Add a task or link something you already worked on. Your proof will appear here as you go."
                    : "Their tasks and proof will collect here as they work toward this goal."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </PageSection>
      </div>
    </div>
  );
}
