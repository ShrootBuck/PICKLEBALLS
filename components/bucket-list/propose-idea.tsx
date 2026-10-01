"use client";

import { Plus } from "lucide-react";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";

export function ProposeIdea({
  circleId,
  memberCount,
}: {
  circleId: string;
  memberCount: number;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const solo = memberCount <= 1;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!title.trim()) {
      setError("Give your idea a title.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await appFetch("/api/bucket-list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ circleId, title, details }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        item?: { status: string };
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Could not propose your idea. Try again.");
        return;
      }
      toast.add({
        title:
          result.item?.status === "ACTIVE"
            ? "Added to your bucket list."
            : "Idea proposed. Now everyone votes.",
        type: "success",
      });
      setOpen(false);
      setTitle("");
      setDetails("");
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
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
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        Propose an idea
      </DialogTrigger>
      <DialogContent showCloseButton={!pending} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Propose a bucket list idea</DialogTitle>
          <DialogDescription>
            {solo
              ? "You’re the only member, so it goes straight onto the list."
              : "It joins the bucket list once everyone in your circle is in."}
          </DialogDescription>
        </DialogHeader>
        <form id={`propose-${id}`} onSubmit={submit} aria-busy={pending}>
          <FieldGroup>
            <Field data-disabled={pending}>
              <FieldLabel htmlFor={`propose-title-${id}`}>
                What do you want to do?
              </FieldLabel>
              <Input
                id={`propose-title-${id}`}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setError(null);
                }}
                maxLength={100}
                placeholder="Go skydiving"
                required
                disabled={pending}
                autoFocus
              />
            </Field>
            <Field data-disabled={pending}>
              <FieldLabel htmlFor={`propose-details-${id}`}>
                Details{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </FieldLabel>
              <Textarea
                id={`propose-details-${id}`}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                maxLength={500}
                placeholder="Where, when, or why it would be legendary"
                disabled={pending}
                className="min-h-24"
              />
            </Field>
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
          <Button type="submit" form={`propose-${id}`} disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            {pending ? "Proposing…" : "Propose idea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
