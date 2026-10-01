"use client";

import {
  CircleCheckBig,
  Flag,
  Hourglass,
  ThumbsDown,
  ThumbsUp,
  Undo2,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
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
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";
import type { BucketItemView } from "@/lib/bucket-list-policy";

type ActionItem = Pick<
  BucketItemView,
  | "id"
  | "title"
  | "status"
  | "stage"
  | "myVote"
  | "canVote"
  | "canWithdraw"
  | "canCancelCompletion"
  | "memberCount"
>;

async function send(url: string, method: string, body?: unknown) {
  const response = await appFetch(url, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    item?: { status: string };
    error?: string;
  };
  if (!response.ok)
    throw new Error(result.error ?? "Could not save that. Try again.");
  return result.item?.status;
}

// fetch rejects with a TypeError when the request never reaches the server.
function failure(error: unknown) {
  return error instanceof Error && !(error instanceof TypeError)
    ? error.message
    : "Could not reach the server. Check your connection and try again.";
}

function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (cause) {
      setError(failure(cause));
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
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant={destructive ? "ghost" : "outline"} />
        }
      >
        {trigger}
      </DialogTrigger>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle className="leading-snug">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
            Keep it
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={confirm}
          >
            {pending && <Spinner data-icon="inline-start" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BucketItemActions({ item }: { item: ActionItem }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingVote, setPendingVote] = useState<boolean | null>(null);
  // Shows the new vote until the refreshed item arrives with it.
  const [optimistic, setOptimistic] = useState<{
    from: boolean | null;
    vote: boolean;
  } | null>(null);
  const vote =
    optimistic && optimistic.from === item.myVote
      ? optimistic.vote
      : item.myVote;
  const solo = item.memberCount <= 1;
  const url = `/api/bucket-list/${encodeURIComponent(item.id)}`;

  async function cast(inFavor: boolean) {
    if (!item.stage || pendingVote !== null || vote === inFavor) return;
    setPendingVote(inFavor);
    setOptimistic({ from: item.myVote, vote: inFavor });
    try {
      const status = await send(`${url}/vote`, "PUT", {
        stage: item.stage,
        inFavor,
      });
      if (status === "ACTIVE" && item.status === "PROPOSED")
        toast.add({
          title: "Everyone’s in. It made the bucket list.",
          type: "success",
        });
      if (status === "COMPLETED")
        toast.add({
          title: "Everyone confirmed. It’s checked off.",
          type: "success",
        });
    } catch (error) {
      setOptimistic(null);
      toast.add({ title: failure(error), type: "error" });
    } finally {
      setPendingVote(null);
    }
  }

  const proposal = item.stage === "PROPOSAL";
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {item.stage && item.canVote && (
        <>
          <Button
            size="sm"
            variant={vote === true ? "default" : "outline"}
            aria-pressed={vote === true}
            disabled={pendingVote !== null}
            onClick={() => cast(true)}
          >
            {pendingVote === true ? (
              <Spinner data-icon="inline-start" />
            ) : proposal ? (
              <ThumbsUp data-icon="inline-start" />
            ) : (
              <CircleCheckBig data-icon="inline-start" />
            )}
            {proposal ? "I’m in" : "Confirm"}
          </Button>
          <Button
            size="sm"
            variant={vote === false ? "destructive" : "outline"}
            aria-pressed={vote === false}
            disabled={pendingVote !== null}
            onClick={() => cast(false)}
          >
            {pendingVote === false ? (
              <Spinner data-icon="inline-start" />
            ) : proposal ? (
              <ThumbsDown data-icon="inline-start" />
            ) : (
              <Hourglass data-icon="inline-start" />
            )}
            {proposal ? "I’m out" : "Not yet"}
          </Button>
        </>
      )}
      {item.status === "ACTIVE" && !item.stage && (
        <ConfirmAction
          trigger={
            <>
              <Flag data-icon="inline-start" />
              Check it off
            </>
          }
          title={`Check off “${item.title}”?`}
          description={
            solo
              ? "You’re the only member, so it’s checked off right away."
              : "Everyone in your circle has to confirm you did it. Until then, it stays on the list."
          }
          confirmLabel={solo ? "Check it off" : "Ask everyone to confirm"}
          onConfirm={async () => {
            const status = await send(`${url}/completion`, "POST");
            toast.add({
              title:
                status === "COMPLETED"
                  ? "Checked off. Nice work."
                  : "Asked everyone to confirm.",
              type: "success",
            });
          }}
        />
      )}
      {item.canCancelCompletion && (
        <ConfirmAction
          destructive
          trigger={
            <>
              <X data-icon="inline-start" />
              Cancel check-off
            </>
          }
          title="Cancel the check-off?"
          description="Everyone’s confirmations are cleared, and it stays on the list. You can ask again later."
          confirmLabel="Cancel check-off"
          onConfirm={async () => {
            await send(`${url}/completion`, "DELETE");
            toast.add({ title: "Check-off cancelled.", type: "info" });
          }}
        />
      )}
      {item.canWithdraw && (
        <ConfirmAction
          destructive
          trigger={
            <>
              <Undo2 data-icon="inline-start" />
              Withdraw
            </>
          }
          title={`Withdraw “${item.title}”?`}
          description="It leaves the vote and won’t join the bucket list. You can propose it again later."
          confirmLabel="Withdraw idea"
          onConfirm={async () => {
            await send(url, "DELETE");
            toast.add({ title: "Idea withdrawn.", type: "info" });
            if (pathname !== "/bucket-list") router.push("/bucket-list");
          }}
        />
      )}
    </div>
  );
}
