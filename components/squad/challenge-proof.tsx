"use client";

import { MessageSquareWarning } from "lucide-react";
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
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";

export function ChallengeProof({
  proofId,
  taskTitle,
  onChallenged,
  evidence,
}: {
  proofId: string;
  taskTitle: string;
  evidence?: ReactNode;
  onChallenged?: (proofId: string) => void;
}) {
  const id = useId();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonInvalid, setReasonInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (error || confirming)
      feedbackRef.current?.scrollIntoView({ block: "nearest" });
  }, [error, confirming]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!reason.trim()) {
      setReasonInvalid(true);
      setError("Say what is missing before challenging proof.");
      reasonRef.current?.focus();
      return;
    }
    // A challenge reopens someone's finished task. Make it a deliberate
    // two-click act instead of a single fat-finger.
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await appFetch(`/api/proofs/${proofId}/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Challenge failed.");
        setPending(false);
        return;
      }
      toast.add({ title: "Proof challenged.", type: "warning" });
      setOpen(false);
      setReason("");
      setPending(false);
      setConfirming(false);
      onChallenged?.(proofId);
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
          setReasonInvalid(false);
          setPending(false);
          setConfirming(false);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="touch-manipulation text-muted-foreground"
          />
        }
      >
        <MessageSquareWarning data-icon="inline-start" /> Challenge
      </DialogTrigger>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={!pending}
      >
        <div className="flex min-h-0 max-h-[inherit] flex-col">
          <DialogHeader className="shrink-0 p-4 pr-12 pb-0 sm:p-6 sm:pr-14 sm:pb-0">
            <DialogTitle>Challenge this proof?</DialogTitle>
            <DialogDescription>
              {taskTitle}. A challenge reopens the task until they post new
              proof.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={submit}
            id={`challenge-form-${id}`}
            aria-busy={pending}
            className="flex flex-1 flex-col gap-4 overflow-auto p-4 sm:p-6"
          >
            {evidence}
            <FieldGroup>
              <Field data-invalid={reasonInvalid} data-disabled={pending}>
                <FieldLabel htmlFor={`challenge-reason-${id}`}>
                  Reason (required)
                </FieldLabel>
                <Textarea
                  ref={reasonRef}
                  id={`challenge-reason-${id}`}
                  name="reason"
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setReasonInvalid(false);
                    setError(null);
                    setConfirming(false);
                  }}
                  disabled={pending}
                  maxLength={500}
                  required
                  placeholder="What is missing? Be specific, not just mean"
                  className="min-h-24"
                  aria-invalid={reasonInvalid}
                  aria-describedby={
                    reasonInvalid
                      ? `challenge-error-${id}`
                      : `challenge-reason-help-${id}`
                  }
                />
                <FieldDescription id={`challenge-reason-help-${id}`}>
                  Say what is missing so they know what to fix. Your reason
                  appears in the post’s comments.
                </FieldDescription>
              </Field>
            </FieldGroup>
            {confirming ? (
              <Alert ref={feedbackRef}>
                <MessageSquareWarning />
                <AlertTitle>This reopens their task. Sure?</AlertTitle>
              </Alert>
            ) : null}
            {error && (
              <Alert
                ref={feedbackRef}
                variant="destructive"
                id={`challenge-error-${id}`}
              >
                <AlertTitle>Challenge failed.</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
          <DialogFooter className="mx-0 mb-0 shrink-0">
            <Button
              type="submit"
              form={`challenge-form-${id}`}
              disabled={pending}
              variant="destructive"
              size="lg"
              className="w-full touch-manipulation sm:w-fit"
            >
              {pending && <Spinner data-icon="inline-start" />}
              {pending
                ? "Saving challenge…"
                : confirming
                  ? "Confirm challenge"
                  : "Challenge it"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
