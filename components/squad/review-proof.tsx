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
  requiredApprovals,
}: {
  proofId: string;
  taskTitle: string;
  requiredApprovals: number;
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
      <DialogTrigger
        render={<Button size="sm" className="touch-manipulation" />}
      >
        <Gavel data-icon="inline-start" /> Review proof
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-hidden p-0 sm:max-w-lg">
        <div className="flex max-h-[90dvh] flex-col">
          <DialogHeader className="shrink-0 p-6 pb-0">
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
            className="flex flex-1 flex-col gap-4 overflow-auto p-6"
          >
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
                />
                <FieldDescription>
                  A challenge with no reason is just hating.
                </FieldDescription>
              </Field>
            </FieldGroup>
            {error && (
              <Alert variant="destructive">
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
              Submit verdict
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
