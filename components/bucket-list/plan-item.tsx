"use client";
import { CalendarDays } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { BucketItemView } from "@/lib/bucket-list-policy";
import {
  parsePhoenixLocalDateTime,
  phoenixLocalDateTimeValue,
} from "@/lib/time";

export function PlanItem({ item }: { item: BucketItemView }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(
    item.scheduledFor
      ? phoenixLocalDateTimeValue(new Date(item.scheduledFor))
      : "",
  );
  const [minimum, setMinimum] = useState(
    String(Math.min(item.minimumParticipants, item.memberCount)),
  );
  const [everyone, setEveryone] = useState(item.everyoneRequired);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const when = parsePhoenixLocalDateTime(date);
    if (!when) {
      setError("Choose a valid date and time.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await appFetch(`/api/bucket-list/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scheduledFor: when.toISOString(),
          minimumParticipants: Number(minimum),
          everyoneRequired: everyone,
          planVersion: item.planVersion,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not save this plan.");
      setOpen(false);
      toast.add({
        title: "Plan saved. Everyone can RSVP to this date.",
        type: "success",
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save this plan.",
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
          setDate(
            item.scheduledFor
              ? phoenixLocalDateTimeValue(new Date(item.scheduledFor))
              : "",
          );
          setMinimum(
            String(Math.min(item.minimumParticipants, item.memberCount)),
          );
          setEveryone(item.everyoneRequired);
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <CalendarDays data-icon="inline-start" />
        {item.scheduledFor ? "Edit plan" : "Make a plan"}
      </DialogTrigger>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>
            {item.scheduledFor ? "Edit the plan" : "Make it happen"}
          </DialogTitle>
          <DialogDescription>
            {item.title}. Pick a time, then let people decide if they can go.
            Saving starts a fresh RSVP round.
          </DialogDescription>
        </DialogHeader>
        <form id={id} onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-date`}>
                Date and time (Phoenix)
              </FieldLabel>
              <Input
                id={`${id}-date`}
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                disabled={pending}
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-all`}
                checked={everyone}
                onCheckedChange={(checked) => setEveryone(checked === true)}
                disabled={pending}
              />
              <FieldLabel htmlFor={`${id}-all`}>Everyone needed</FieldLabel>
            </Field>
            {everyone ? (
              <p className="text-sm text-muted-foreground">
                All {item.memberCount} current members must RSVP yes. People
                joining later will not become required.
              </p>
            ) : (
              <Field>
                <FieldLabel htmlFor={`${id}-min`}>
                  Minimum people going
                </FieldLabel>
                <Input
                  id={`${id}-min`}
                  type="number"
                  min={1}
                  max={item.memberCount}
                  value={minimum}
                  onChange={(e) => setMinimum(e.target.value)}
                  required
                  disabled={pending}
                />
                <FieldDescription>
                  Anyone can sit this one out. The plan is on when this many
                  people RSVP yes.
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
          <Button type="submit" form={id} disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
