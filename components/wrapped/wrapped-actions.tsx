"use client";
import { Download, Pencil, Plus } from "lucide-react";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";

export function WeeklyWinEditor({
  circleId,
  week,
  initial,
}: {
  circleId: string;
  week: string;
  initial: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await appFetch("/api/wrapped/win", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ circleId, week, body }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not save your win.");
      setOpen(false);
      toast.add({
        title: body.trim() ? "Your win is in the recap." : "Win removed.",
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
      onOpenChange={(next) => {
        if (!pending) {
          setOpen(next);
          setBody(initial);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        {initial ? (
          <Pencil data-icon="inline-start" />
        ) : (
          <Plus data-icon="inline-start" />
        )}
        {initial ? "Edit your win" : "Add your win"}
      </DialogTrigger>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>What are you proud of this week?</DialogTitle>
          <DialogDescription>
            Big or small, it belongs here. Your circle will see it in this
            week's recap.
          </DialogDescription>
        </DialogHeader>
        <form id={`win-${id}`} onSubmit={save}>
          <Field data-disabled={pending}>
            <FieldLabel htmlFor={id}>Your win</FieldLabel>
            <Textarea
              id={id}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={280}
              placeholder="Finally finished the thing I'd been putting off."
              disabled={pending}
              autoFocus
            />
            <FieldDescription>
              {body.length}/280
              {initial ? ". Clear the text to remove your win." : ""}
            </FieldDescription>
          </Field>
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
          <Button
            type="submit"
            form={`win-${id}`}
            disabled={pending || (!body.trim() && !initial)}
          >
            {pending && <Spinner data-icon="inline-start" />}
            {!body.trim() && initial ? "Remove win" : "Save win"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DownloadWrapped({
  circleId,
  week,
}: {
  circleId: string;
  week: string;
}) {
  const [pending, setPending] = useState(false);
  async function download() {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch(
        `/api/wrapped/card?${new URLSearchParams({ circle: circleId, week })}`,
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Could not make your recap card.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `pickleballs-wrapped-${week}.png`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (cause) {
      toast.add({
        title:
          cause instanceof Error
            ? cause.message
            : "Could not download. Try again.",
        type: "error",
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <Button variant="outline" onClick={download} disabled={pending}>
      {pending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <Download data-icon="inline-start" />
      )}
      {pending ? "Making your card..." : "Download card"}
    </Button>
  );
}
