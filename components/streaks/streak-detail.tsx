"use client";

import {
  Check,
  CircleSlash,
  Flame,
  MoreHorizontal,
  Pencil,
  Trash2,
  Trophy,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StreakForm } from "@/components/streaks/streak-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";
import {
  formatStreakMoney,
  formatStreakUnits,
  type StreakHistoryDay,
  type StreakView,
} from "@/lib/streak-policy";
import { formatDayLong, formatHistoryTime, formatReplyTime } from "@/lib/time";

export function StreakOwnerMenu({ view }: { view: StreakView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"retire" | "delete" | null>(null);
  const [pending, setPending] = useState(false);
  const name = view.title;
  async function run() {
    if (!confirm || pending) return;
    setPending(true);
    try {
      const response = await appFetch(
        `/api/streaks/${encodeURIComponent(view.id)}`,
        confirm === "retire"
          ? {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "retire" }),
            }
          : { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not save. Try again.");
      toast.add({
        title:
          confirm === "retire"
            ? "Retired. It’s a trophy on your profile now."
            : "Streak deleted.",
        type: "success",
      });
      setConfirm(null);
      if (confirm === "delete") router.push("/streaks");
    } catch (cause) {
      toast.add({
        title: cause instanceof Error ? cause.message : "Could not save.",
        type: "error",
      });
    } finally {
      setPending(false);
    }
  }
  const active = view.status === "ACTIVE";
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Streak options"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {active && (
              <>
                <DropdownMenuItem onClick={() => setEditing(true)}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setConfirm("retire")}>
                  <Trophy /> Retire streak
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirm("delete")}
            >
              <Trash2 /> Delete streak
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {active && (
        <StreakForm
          circleId={view.circleId}
          streak={view}
          open={editing}
          onOpenChange={setEditing}
        />
      )}
      <Dialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next && !pending) setConfirm(null);
        }}
      >
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>
              {confirm === "retire" ? `Retire ${name}?` : `Delete ${name}?`}
            </DialogTitle>
            <DialogDescription>
              {confirm === "retire"
                ? "It becomes a trophy on your profile with its final count and all-time totals. You won’t be able to log it again."
                : "This removes the streak, its history, and its posts for good. Retire it instead to keep it as a trophy."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              variant={confirm === "delete" ? "destructive" : "default"}
              disabled={pending}
              onClick={run}
            >
              {pending && <Spinner data-icon="inline-start" />}
              {confirm === "retire" ? "Retire streak" : "Delete streak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UndoButton({ view, entryId }: { view: StreakView; entryId: string }) {
  const [pending, setPending] = useState(false);
  async function undo() {
    if (pending) return;
    setPending(true);
    try {
      const response = await appFetch(
        `/api/streaks/${encodeURIComponent(view.id)}/entries/${encodeURIComponent(entryId)}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not undo.");
      toast.add({ title: "Entry removed.", type: "success" });
    } catch (cause) {
      toast.add({
        title: cause instanceof Error ? cause.message : "Could not undo.",
        type: "error",
      });
      setPending(false);
    }
  }
  return (
    <Button
      variant="ghost"
      size="xs"
      disabled={pending}
      aria-busy={pending}
      onClick={undo}
    >
      <Undo2 data-icon="inline-start" />
      Undo
    </Button>
  );
}

export function StreakHistoryList({
  view,
  history,
}: {
  view: StreakView;
  history: StreakHistoryDay[];
}) {
  if (!history.length)
    return (
      <p className="text-sm text-muted-foreground">
        {view.kind === "QUIT"
          ? "Your first clean day shows up here once you confirm it."
          : "Your logs show up here."}
      </p>
    );
  return (
    <ol className="flex flex-col divide-y rounded-lg border">
      {history.map((day) => (
        <li key={day.day} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{formatDayLong(day.day)}</p>
            <Badge
              variant={
                day.state === "done"
                  ? "success"
                  : day.state === "slipped"
                    ? "destructive"
                    : "outline"
              }
            >
              {day.state === "done"
                ? view.kind === "QUIT"
                  ? "Clean"
                  : day.units && view.unitLabel
                    ? formatStreakUnits(day.units, view.unitLabel)
                    : "Done"
                : day.state === "slipped"
                  ? "Slipped"
                  : day.state === "missed"
                    ? "Missed"
                    : "Waiting"}
            </Badge>
          </div>
          {day.state === "missed" && (
            <p className="text-xs text-muted-foreground">
              Nothing was logged before the window closed, so the streak reset.
            </p>
          )}
          {day.entries.length > 0 && (
            <ul className="flex flex-col gap-2">
              {day.entries.map((entry) => {
                const Icon =
                  entry.kind === "SLIP"
                    ? CircleSlash
                    : entry.kind === "CLEAN"
                      ? Check
                      : Flame;
                const amounts = [
                  entry.costCents
                    ? `+${formatStreakMoney(entry.costCents)}`
                    : null,
                  entry.units && view.unitLabel
                    ? formatStreakUnits(entry.units, view.unitLabel)
                    : null,
                ].filter(Boolean);
                return (
                  <li key={entry.id} className="flex items-start gap-3 text-sm">
                    <Icon
                      className={
                        entry.kind === "SLIP"
                          ? "mt-0.5 size-4 shrink-0 text-destructive"
                          : "mt-0.5 size-4 shrink-0 text-primary"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p>
                        {entry.kind === "SLIP"
                          ? `Slipped at ${formatHistoryTime(entry.at)}`
                          : entry.kind === "CLEAN"
                            ? "Confirmed clean"
                            : `Logged at ${formatHistoryTime(entry.at)}`}
                        {amounts.length ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {amounts.join(", ")}
                          </span>
                        ) : null}
                      </p>
                      {entry.kind === "CLEAN" && (
                        <p className="text-xs text-muted-foreground">
                          Confirmed {formatReplyTime(entry.at)}
                        </p>
                      )}
                      {entry.note && (
                        <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                          {entry.note}
                        </p>
                      )}
                    </div>
                    {entry.canUndo && (
                      <UndoButton view={view} entryId={entry.id} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
