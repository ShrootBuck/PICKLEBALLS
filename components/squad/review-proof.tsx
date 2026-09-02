"use client";

import { Check, Gavel, MessageSquareWarning } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  FieldTitle,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function ReviewProof({
  proofId,
  taskTitle,
}: {
  proofId: string;
  taskTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"APPROVED" | "CHALLENGED">(
    "APPROVED",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/proofs/${proofId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, note: form.get("note") }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Review failed.");
      setPending(false);
      return;
    }
    toast.add({
      title: decision === "APPROVED" ? "Proof approved." : "Proof challenged.",
      type: decision === "APPROVED" ? "success" : "warning",
    });
    setOpen(false);
    setPending(false);
    router.refresh();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Gavel data-icon="inline-start" /> Review
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Call the proof</DialogTitle>
          <DialogDescription>
            {taskTitle}. First valid review wins, so look before clicking.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field orientation="responsive">
              <FieldTitle id={`decision-${proofId}`}>Verdict</FieldTitle>
              <ToggleGroup
                value={[decision]}
                onValueChange={(value) =>
                  value[0] && setDecision(value[0] as typeof decision)
                }
                aria-labelledby={`decision-${proofId}`}
                variant="outline"
                spacing={2}
              >
                <ToggleGroupItem value="APPROVED">
                  <Check /> Approve
                </ToggleGroupItem>
                <ToggleGroupItem value="CHALLENGED">
                  <MessageSquareWarning /> Challenge
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`review-note-${proofId}`}>
                Reviewer note
              </FieldLabel>
              <Textarea
                id={`review-note-${proofId}`}
                name="note"
                maxLength={500}
                required={decision === "CHALLENGED"}
                placeholder={
                  decision === "CHALLENGED"
                    ? "Say exactly what is missing or unclear"
                    : "Optional useful context"
                }
              />
              <FieldDescription>
                A challenge without a reason is just being annoying.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Review failed.</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={pending}
              variant={decision === "CHALLENGED" ? "destructive" : "default"}
            >
              {pending && <Spinner data-icon="inline-start" />}
              Submit verdict
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
