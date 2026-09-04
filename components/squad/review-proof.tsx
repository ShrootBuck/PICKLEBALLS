"use client";

import { Check, Gavel, MessageSquareWarning } from "lucide-react";
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
  requiredApprovals,
  onReviewed,
}: {
  proofId: string;
  taskTitle: string;
  requiredApprovals: number;
  onReviewed?: (proofId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"APPROVED" | "CHALLENGED">(
    "APPROVED",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmChallenge, setConfirmChallenge] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Challenging sends the proof back to open. Make it a deliberate
    // two-click act instead of a single fat-finger.
    if (decision === "CHALLENGED" && !confirmChallenge) {
      setConfirmChallenge(true);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(`/api/proofs/${proofId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, note: form.get("note") }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Review failed.");
        setPending(false);
        return;
      }
      toast.add({
        title:
          decision === "APPROVED" ? "Proof approved." : "Proof challenged.",
        type: decision === "APPROVED" ? "success" : "warning",
      });
      setOpen(false);
      setPending(false);
      setConfirmChallenge(false);
      // Local update, no full-page refresh.
      onReviewed?.(proofId);
    } catch {
      setError("Could not reach the server. Check your wifi and try again.");
      setPending(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setPending(false);
          setConfirmChallenge(false);
        }
      }}
    >
      <DialogTrigger
        render={<Button size="sm" className="touch-manipulation" />}
      >
        <Gavel data-icon="inline-start" /> Review proof
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-hidden p-0 sm:max-w-lg">
        <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
          <DialogHeader className="shrink-0 p-4 pb-0 sm:p-6 sm:pb-0">
            <DialogTitle>Call it like it is</DialogTitle>
            <DialogDescription>
              {taskTitle}. {requiredApprovals}{" "}
              {requiredApprovals === 1
                ? "approval verifies"
                : "approvals verify"}{" "}
              it. One challenge sends it back to the grind.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={submit}
            id={`review-form-${proofId}`}
            className="flex flex-1 flex-col gap-4 overflow-auto p-4 sm:p-6"
          >
            <FieldGroup>
              <Field orientation="responsive">
                <FieldTitle id={`decision-${proofId}`}>Verdict</FieldTitle>
                <ToggleGroup
                  value={[decision]}
                  onValueChange={(value) => {
                    if (value[0]) {
                      setDecision(value[0] as typeof decision);
                      setConfirmChallenge(false);
                    }
                  }}
                  aria-labelledby={`decision-${proofId}`}
                  variant="outline"
                  spacing={2}
                  className="w-full"
                >
                  <ToggleGroupItem value="APPROVED" className="flex-1">
                    <Check /> Approve
                  </ToggleGroupItem>
                  <ToggleGroupItem value="CHALLENGED" className="flex-1">
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
                      ? "What is missing? Be specific, not just mean"
                      : "Optional. Say why this counts."
                  }
                  className="min-h-24"
                  aria-invalid={Boolean(error)}
                  aria-describedby={
                    error ? `review-error-${proofId}` : undefined
                  }
                />
                <FieldDescription>
                  A challenge with no reason is just hating.
                </FieldDescription>
              </Field>
            </FieldGroup>
            {confirmChallenge && decision === "CHALLENGED" ? (
              <Alert>
                <MessageSquareWarning />
                <AlertTitle>This sends it back to open. Sure?</AlertTitle>
                <AlertDescription>
                  Hit submit again to challenge. Switch to approve to back out.
                </AlertDescription>
              </Alert>
            ) : null}
            {error && (
              <Alert variant="destructive" id={`review-error-${proofId}`}>
                <AlertTitle>Review failed.</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
          <DialogFooter className="mx-0 mb-0 shrink-0">
            <Button
              type="submit"
              form={`review-form-${proofId}`}
              disabled={pending}
              variant={decision === "CHALLENGED" ? "destructive" : "default"}
              size="lg"
              className="w-full touch-manipulation sm:w-fit"
            >
              {pending && <Spinner data-icon="inline-start" />}
              {decision === "CHALLENGED" && !confirmChallenge
                ? "Challenge it"
                : decision === "CHALLENGED"
                  ? "Confirm challenge"
                  : "Submit verdict"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
