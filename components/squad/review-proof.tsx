"use client";

import { Check, Gavel, MessageSquareWarning } from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
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
import { appFetch } from "@/lib/app-refresh";

export function ReviewProof({
  proofId,
  taskTitle,
  requiredApprovals,
  onReviewed,
  evidence,
  definitionOfDone,
}: {
  proofId: string;
  taskTitle: string;
  evidence?: ReactNode;
  definitionOfDone?: string;
  requiredApprovals: number;
  onReviewed?: (
    proofId: string,
    decision: "APPROVED" | "CHALLENGED",
    result: {
      proofStatus: "PENDING" | "APPROVED" | "CHALLENGED";
      approvalCount: number;
      requiredApprovals: number;
    },
  ) => void;
}) {
  const id = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteInvalid, setNoteInvalid] = useState(false);
  const [decision, setDecision] = useState<"APPROVED" | "CHALLENGED">(
    "APPROVED",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmChallenge, setConfirmChallenge] = useState(false);
  useEffect(() => {
    if (error || confirmChallenge)
      feedbackRef.current?.scrollIntoView({ block: "nearest" });
  }, [error, confirmChallenge]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!note.trim()) {
      setNoteInvalid(true);
      setError("Every verdict needs a comment.");
      noteRef.current?.focus();
      return;
    }
    // Challenging sends the proof back to open. Make it a deliberate
    // two-click act instead of a single fat-finger.
    if (decision === "CHALLENGED" && !confirmChallenge) {
      setConfirmChallenge(true);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await appFetch(`/api/proofs/${proofId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Review failed.");
        setPending(false);
        return;
      }
      const { review } = await response.json();
      toast.add({
        title:
          decision === "APPROVED"
            ? review.proofStatus === "APPROVED"
              ? "Everyone approved. Proof verified."
              : "Your approval is saved. Waiting for the rest of the circle."
            : "Proof challenged.",
        type: decision === "APPROVED" ? "success" : "warning",
      });
      setOpen(false);
      setNote("");
      setDecision("APPROVED");
      setPending(false);
      setConfirmChallenge(false);
      // Remove the reviewed card immediately, then reconcile the board,
      // history, and counts with the committed server state.
      onReviewed?.(proofId, decision, review);
    } catch {
      setError("Could not reach the server. Check your wifi and try again.");
      setPending(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) {
          setError(null);
          setNoteInvalid(false);
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
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={!pending}
      >
        <div className="flex min-h-0 max-h-[inherit] flex-col">
          <DialogHeader className="shrink-0 p-4 pr-12 pb-0 sm:p-6 sm:pr-14 sm:pb-0">
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
            id={`review-form-${id}`}
            aria-busy={pending}
            className="flex flex-1 flex-col gap-4 overflow-auto p-4 sm:p-6"
          >
            {evidence}
            {definitionOfDone && (
              <p className="text-sm leading-relaxed">
                <strong>Done means: </strong>
                {definitionOfDone}
              </p>
            )}
            <FieldGroup>
              <Field orientation="responsive">
                <FieldTitle id={`decision-${id}`}>Verdict</FieldTitle>
                <ToggleGroup
                  disabled={pending}
                  value={[decision]}
                  onValueChange={(value) => {
                    if (value[0]) {
                      setDecision(value[0] as typeof decision);
                      setConfirmChallenge(false);
                    }
                  }}
                  aria-labelledby={`decision-${id}`}
                  variant="outline"
                  spacing={2}
                  className="w-full"
                >
                  <ToggleGroupItem
                    value="APPROVED"
                    data-tone="success"
                    className="flex-1"
                  >
                    <Check /> Approve
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="CHALLENGED"
                    data-tone="destructive"
                    className="flex-1"
                  >
                    <MessageSquareWarning /> Challenge
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Field data-invalid={noteInvalid} data-disabled={pending}>
                <FieldLabel htmlFor={`review-note-${id}`}>
                  Reviewer note (required)
                </FieldLabel>
                <Textarea
                  ref={noteRef}
                  id={`review-note-${id}`}
                  name="note"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    setNoteInvalid(false);
                    setError(null);
                    setConfirmChallenge(false);
                  }}
                  disabled={pending}
                  maxLength={500}
                  required
                  placeholder={
                    decision === "CHALLENGED"
                      ? "What is missing? Be specific, not just mean"
                      : "Say why this counts."
                  }
                  className="min-h-24"
                  aria-invalid={noteInvalid}
                  aria-describedby={
                    noteInvalid
                      ? `review-error-${id}`
                      : `review-note-help-${id}`
                  }
                />
                <FieldDescription id={`review-note-help-${id}`}>
                  Every verdict needs a comment. Say why it counts or what is
                  missing.
                </FieldDescription>
              </Field>
            </FieldGroup>
            {confirmChallenge && decision === "CHALLENGED" ? (
              <Alert ref={feedbackRef}>
                <MessageSquareWarning />
                <AlertTitle>This sends it back to open. Sure?</AlertTitle>
                <AlertDescription>
                  Choose Confirm challenge to send the proof back. Switch to
                  approve to back out.
                </AlertDescription>
              </Alert>
            ) : null}
            {error && (
              <Alert
                ref={feedbackRef}
                variant="destructive"
                id={`review-error-${id}`}
              >
                <AlertTitle>Review failed.</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
          <DialogFooter className="mx-0 mb-0 shrink-0">
            <Button
              type="submit"
              form={`review-form-${id}`}
              disabled={pending}
              variant={decision === "CHALLENGED" ? "destructive" : "default"}
              size="lg"
              className="w-full touch-manipulation sm:w-fit"
            >
              {pending && <Spinner data-icon="inline-start" />}
              {pending
                ? "Saving verdict…"
                : decision === "CHALLENGED" && !confirmChallenge
                  ? "Challenge it"
                  : decision === "CHALLENGED"
                    ? "Confirm challenge"
                    : "Approve proof"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
