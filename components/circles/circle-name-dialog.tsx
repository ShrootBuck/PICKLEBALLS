"use client";

import { Pencil, Plus } from "lucide-react";
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
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";
import {
  circleNameError,
  circleNameSchema,
  MAX_CIRCLE_NAME_LENGTH,
} from "@/lib/circle-name";

export type SavedCircle = { id: string; name: string; slug: string };

export function CircleNameDialog({
  circle,
  onSaved,
}: {
  circle?: SavedCircle;
  onSaved: (circle: SavedCircle) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(circle?.name ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const parsed = circleNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(circleNameError);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await appFetch(
        circle ? `/api/circles/${circle.id}` : "/api/circles",
        {
          method: circle ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(circle ? { action: "rename" } : {}),
            name: parsed.data,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not save the circle.");
      onSaved(body);
      setOpen(false);
      toast.add({
        title: circle
          ? "Circle renamed."
          : "Circle created. Invite your people next.",
        type: "success",
      });
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
      onOpenChange={(value) => {
        if (pending) return;
        setOpen(value);
        setName(circle?.name ?? "");
        setError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant={circle ? "ghost" : "default"}
            size={circle ? "sm" : "default"}
          />
        }
      >
        {circle ? (
          <Pencil data-icon="inline-start" />
        ) : (
          <Plus data-icon="inline-start" />
        )}
        {circle ? "Rename" : "New circle"}
      </DialogTrigger>
      <DialogContent showCloseButton={!pending}>
        <form onSubmit={save} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>
              {circle ? "Rename circle" : "Create a circle"}
            </DialogTitle>
            <DialogDescription>
              {circle
                ? "This also changes the name of your circle's group chat."
                : "Give your group a name. You can invite friends once it's created."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={!!error} data-disabled={pending}>
              <FieldLabel htmlFor={id}>Circle name</FieldLabel>
              <Input
                id={id}
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. After school"
                maxLength={MAX_CIRCLE_NAME_LENGTH}
                required
                disabled={pending}
                aria-invalid={!!error}
                aria-describedby={`${id}-hint`}
                autoComplete="off"
              />
              <FieldDescription id={`${id}-hint`}>
                Up to {MAX_CIRCLE_NAME_LENGTH} characters.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || !name.trim() || name.trim() === circle?.name}
            >
              {pending && <Spinner data-icon="inline-start" />}
              {circle ? "Save name" : "Create circle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
