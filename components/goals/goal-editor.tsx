"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";

export async function saveGoalAction(goalId: string, action: unknown) {
  const response = await appFetch(`/api/goals/${encodeURIComponent(goalId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Could not save your goal.");
  return result;
}

export function GoalEditor({
  circleId,
  goal,
}: {
  circleId: string;
  goal?: {
    id: string;
    title: string;
    description: string | null;
    targetDate: string;
  };
}) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [milestones, setMilestones] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const details = { title, description, targetDate };
      if (goal)
        await saveGoalAction(goal.id, { action: "details", ...details });
      else {
        const response = await appFetch("/api/goals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            circleId,
            ...details,
            milestones: milestones
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Could not create your goal.");
        router.push(`/goals/${result.goal.id}`);
      }
      toast.add({
        title: goal ? "Goal updated." : "A bigger goal. One step at a time.",
        type: "success",
      });
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        setError(null);
        if (next) {
          setTitle(goal?.title ?? "");
          setDescription(goal?.description ?? "");
          setTargetDate(goal?.targetDate ?? "");
          setMilestones("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant={goal ? "outline" : "default"}
            size={goal ? "sm" : "default"}
          />
        }
      >
        {goal ? (
          <Pencil data-icon="inline-start" />
        ) : (
          <Plus data-icon="inline-start" />
        )}
        {goal ? "Edit goal" : "New goal"}
      </DialogTrigger>
      <DialogContent showCloseButton={!pending} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {goal ? "Edit your goal" : "What are you working toward?"}
          </DialogTitle>
          <DialogDescription>
            Your circle can follow along. You decide the milestones and link the
            work.
          </DialogDescription>
        </DialogHeader>
        <form id={`goal-${id}`} onSubmit={submit} aria-busy={pending}>
          <FieldGroup>
            <Field data-disabled={pending}>
              <FieldLabel htmlFor={`${id}-title`}>The goal</FieldLabel>
              <Input
                id={`${id}-title`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Finish my first short film"
                maxLength={120}
                required
                disabled={pending}
                autoFocus
              />
            </Field>
            <Field data-disabled={pending}>
              <FieldLabel htmlFor={`${id}-why`}>
                What would success look like? (optional)
              </FieldLabel>
              <Textarea
                id={`${id}-why`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A finished film I'm proud to show my friends."
                maxLength={1500}
                disabled={pending}
              />
            </Field>
            <Field data-disabled={pending}>
              <FieldLabel htmlFor={`${id}-date`}>
                Target date (optional)
              </FieldLabel>
              <Input
                id={`${id}-date`}
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                disabled={pending}
              />
              <FieldDescription>
                A date to aim for. Your daily tasks still get their own 24
                hours.
              </FieldDescription>
            </Field>
            {!goal && (
              <Field data-disabled={pending}>
                <FieldLabel htmlFor={`${id}-milestones`}>
                  Milestones (optional)
                </FieldLabel>
                <Textarea
                  id={`${id}-milestones`}
                  value={milestones}
                  onChange={(e) => setMilestones(e.target.value)}
                  placeholder={
                    "Finish the script\nShoot the film\nComplete the final edit"
                  }
                  maxLength={3220}
                  disabled={pending}
                  className="min-h-24"
                />
                <FieldDescription>
                  One per line, up to 20. You can add more later.
                </FieldDescription>
              </Field>
            )}
          </FieldGroup>
        </form>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="submit" form={`goal-${id}`} disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            {goal ? "Save goal" : "Create goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
