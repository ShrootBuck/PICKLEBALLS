"use client";

import { Clock3, Pencil, Play, Square } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  StopwatchElapsed,
  useStopwatch,
  useTaskWorkSessions,
} from "@/components/work-sessions/stopwatch-provider";
import { appFetch } from "@/lib/app-refresh";
import type { SocialTask } from "@/lib/social-types";
import {
  formatReplyTime,
  parsePhoenixLocalDateTime,
  phoenixLocalDateTimeValue,
} from "@/lib/time";
import {
  canTrackTask,
  elapsedMilliseconds,
  formatStopwatch,
  summarizeWorkSessions,
  type WorkSessionView,
} from "@/lib/work-session-policy";

function SessionEditor({
  session,
  onSaved,
  onCancel,
}: {
  session: WorkSessionView;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState(
    phoenixLocalDateTimeValue(new Date(session.startedAt), true),
  );
  const [end, setEnd] = useState(
    phoenixLocalDateTimeValue(new Date(session.endedAt as string), true),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { changed } = useStopwatch();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        const startedAt = parsePhoenixLocalDateTime(start);
        const endedAt = parsePhoenixLocalDateTime(end);
        if (!startedAt || !endedAt || endedAt <= startedAt) {
          setError("The finish time must be after the start time.");
          return;
        }
        setPending(true);
        setError(null);
        try {
          const response = await appFetch(
            `/api/work-sessions/${encodeURIComponent(session.id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: "edit",
                startedAt: startedAt.toISOString(),
                endedAt: endedAt.toISOString(),
                updatedAt: session.updatedAt,
              }),
            },
          );
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error ?? "Could not save the session.");
          changed();
          toast.add({ title: "Recorded time updated", type: "success" });
          onSaved();
        } catch (reason) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not save. Try again.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={`session-start-${session.id}`}>
            Started
          </FieldLabel>
          <Input
            id={`session-start-${session.id}`}
            type="datetime-local"
            step="any"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            required
            disabled={pending}
            aria-invalid={!!error}
          />
        </Field>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={`session-end-${session.id}`}>
            Finished
          </FieldLabel>
          <Input
            id={`session-end-${session.id}`}
            type="datetime-local"
            step="any"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            required
            disabled={pending}
            aria-invalid={!!error}
          />
          <FieldDescription>
            Phoenix time. Corrections also update Timeblock.
          </FieldDescription>
        </Field>
      </FieldGroup>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />} Save times
        </Button>
      </div>
    </form>
  );
}

export function TaskStopwatch({
  task,
  historical = false,
}: {
  task: SocialTask;
  historical?: boolean;
}) {
  const { active, pending, start, stop } = useStopwatch();
  const [open, setOpen] = useState(false);
  const recorded = useTaskWorkSessions(open ? task : null);
  const { error, loading } = recorded;
  const sessions = open ? recorded.sessions : (task.workSessions ?? []);
  const [editing, setEditing] = useState<WorkSessionView | null>(null);
  const summary = summarizeWorkSessions(sessions);
  const running = active?.taskId === task.id ? active : null;
  const available = !historical && canTrackTask(task);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {(running || available) && (
          <Button
            size="sm"
            variant={running ? "default" : "outline"}
            disabled={pending || (!!active && !running)}
            title={
              active && !running
                ? `Stop ${active.title} before starting this task.`
                : undefined
            }
            onClick={() => void (running ? stop(running.id) : start(task.id))}
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : running ? (
              <Square data-icon="inline-start" />
            ) : (
              <Play data-icon="inline-start" />
            )}
            {running ? "Stop" : summary.count ? "Resume" : "Start"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          aria-label={`Recorded time for ${task.title}`}
        >
          <Clock3 data-icon="inline-start" />
          {running ? (
            <StopwatchElapsed session={running} prefix={summary.milliseconds} />
          ) : summary.count ? (
            formatStopwatch(summary.milliseconds)
          ) : (
            "Sessions"
          )}
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Adjust recorded time" : task.title}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Correct a session if you started late or forgot to stop."
                : `${formatStopwatch(summary.milliseconds)} recorded across ${summary.count} ${summary.count === 1 ? "session" : "sessions"}. Breaks are excluded.`}
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <SessionEditor
              key={editing.id}
              session={editing}
              onSaved={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {loading && !sessions.length && (
                <div className="flex items-center gap-2">
                  <Spinner /> Loading sessions
                </div>
              )}
              {!loading && !sessions.length && (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>No recorded sessions yet</EmptyTitle>
                    <EmptyDescription>
                      Start the stopwatch when you begin working. Stop it for
                      breaks, then resume when you return.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-sm tabular-nums">
                      {session.endedAt ? (
                        formatStopwatch(elapsedMilliseconds(session))
                      ) : (
                        <StopwatchElapsed session={session} />
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatReplyTime(session.startedAt)} to{" "}
                      {session.endedAt
                        ? formatReplyTime(session.endedAt)
                        : "now"}
                    </span>
                  </div>
                  {session.endedAt ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(session)}
                    >
                      <Pencil data-icon="inline-start" /> Edit
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => void stop(session.id)}
                    >
                      <Square data-icon="inline-start" /> Stop
                    </Button>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                All times are in Phoenix time. Stopped sessions appear in
                Timeblock automatically.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
