"use client";

import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { holdAppRefresh, requestAppRefresh } from "@/lib/app-refresh";

export function DeleteAction({
  label,
  title,
  description,
  endpoint,
  body,
  method = "DELETE",
  confirmationText,
  redirectTo,
  onDeleted,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  label: string;
  title: string;
  description: string;
  endpoint: string;
  body?: Record<string, unknown>;
  method?: "DELETE" | "PATCH";
  confirmationText?: string;
  redirectTo?: string;
  onDeleted?: () => void;
  open?: boolean;
  onOpenChange?: (value: boolean) => void;
  hideTrigger?: boolean;
}) {
  const inputId = useId();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    if (pending) return;
    const release = holdAppRefresh();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, confirmation }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error ?? "Could not finish. Try again.");
      setOpen(false);
      setConfirmation("");
      onDeleted?.();
      if (redirectTo) window.location.assign(redirectTo);
      else {
        requestAppRefresh();
        toast.add({ title: "Done.", type: "success" });
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not reach the server. Try again.",
      );
    } finally {
      release();
      setPending(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError(null);
          setConfirmation("");
        }
      }}
    >
      {!hideTrigger && (
        <DialogTrigger render={<Button variant="ghost" size="sm" />}>
          <Trash2 data-icon="inline-start" />
          {label}
        </DialogTrigger>
      )}
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {confirmationText && (
          <Field>
            <FieldLabel htmlFor={inputId}>
              Type {confirmationText} to confirm
            </FieldLabel>
            <Input
              id={inputId}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={pending}
              autoComplete="off"
            />
          </Field>
        )}
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
            Go back
          </Button>
          <Button
            variant="destructive"
            disabled={
              pending ||
              (!!confirmationText && confirmation !== confirmationText)
            }
            onClick={confirm}
          >
            {pending && <Spinner data-icon="inline-start" />}
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
