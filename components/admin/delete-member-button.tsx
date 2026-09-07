"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import { appFetch } from "@/lib/app-refresh";

export function DeleteMemberButton({
  userId,
  name,
  circleId,
}: {
  userId: string;
  name: string;
  circleId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    try {
      const response = await appFetch(
        `/api/admin/members/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ circleId }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Could not delete member. Try again.");
        return;
      }
      setOpen(false);
      router.refresh();
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
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="destructive"
            size="sm"
            aria-label={`Delete ${name}`}
          />
        }
      >
        <Trash2 data-icon="inline-start" />
        Delete
      </DialogTrigger>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Delete {name} from this circle?</DialogTitle>
          <DialogDescription>
            They will lose access to this circle. Their past posts and account
            will stay. They can rejoin with a new invite.
          </DialogDescription>
        </DialogHeader>
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
          <Button variant="destructive" disabled={pending} onClick={remove}>
            {pending && <Spinner data-icon="inline-start" />}Delete member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
