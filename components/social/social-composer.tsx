"use client";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ClipboardList,
  Clock3,
  Flame,
  MessageCircle,
  Plus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { GoalPicker } from "@/components/goals/goal-picker";
import { MediaPicker } from "@/components/media/media-picker";
import {
  UploadStatus,
  useUploadStatus,
} from "@/components/media/upload-status";
import { MoodCheckInSheet } from "@/components/social/mood-check-in";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  useStopwatch,
  useTaskWorkSessions,
} from "@/components/work-sessions/stopwatch-provider";
import { appFetch, holdAppRefresh } from "@/lib/app-refresh";
import { uploadMedia } from "@/lib/media-upload";
import { newStreakHref } from "@/lib/navigation";
import type { SocialTask } from "@/lib/social-types";
import {
  formatDayShort,
  formatHistoryTime,
  parsePhoenixLocalDateTime,
  phoenixLocalDateTimeValue,
} from "@/lib/time";
import {
  formatStopwatch,
  summarizeWorkSessions,
} from "@/lib/work-session-policy";

type Mode = "choose" | "task" | "proof" | "check-in";
export type ComposerRequest = {
  mode: Mode;
  task?: SocialTask;
  goal?: { id: string; title: string };
};
export type ComposerDraft = {
  title: string;
  goalId?: string | null;
  files: File[];
  note: string;
  startedAt: string;
  completedAt: string;
  step: "media" | "details";
  editTimes: boolean;
  uploadedIds: string[] | null;
};

type ComposerProps = {
  request: ComposerRequest;
  tasks: SocialTask[];
  circleId: string;
  day: string;
  onClose: () => void;
  draft?: ComposerDraft;
  onSaveDraft: (draft: ComposerDraft) => void;
  onDiscardDraft: () => void;
  onRequestChange: (request: ComposerRequest) => void;
  draftKey: string;
};

export function SocialComposer(props: ComposerProps) {
  const mode = props.request.mode;
  const task = props.request.task ?? null;
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(true);
  if (mode === "check-in") return <MoodCheckInSheet onClose={props.onClose} />;
  const heading = {
    choose: "What’s happening?",
    task: task ? "Edit your task" : "Make a commitment",
    proof: task?.proof ? "Another look. Better proof." : "Show the work",
  }[mode];
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) setOpen(false);
      }}
      // Unmount only after the exit transition completes.
      onOpenChangeComplete={(next) => {
        if (!next) props.onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="social-composer"
        overlayClassName="social-composer-overlay"
        data-mode={mode}
        showCloseButton={!pending}
      >
        <SheetHeader>
          <SheetTitle>{heading}</SheetTitle>
          {(mode === "task" || mode === "proof") && (
            <SheetDescription>
              {mode === "task"
                ? "Submit proof within 24 hours of creating a task. Reviews have no deadline."
                : (task?.title ?? "Pick the task you finished.")}
            </SheetDescription>
          )}
        </SheetHeader>
        <ComposerForm
          key={props.draftKey}
          {...props}
          onClose={() => setOpen(false)}
          pending={pending}
          setPending={setPending}
        />
      </SheetContent>
    </Sheet>
  );
}

function ComposerForm({
  request,
  tasks,
  circleId,
  onClose,
  draft,
  onSaveDraft,
  onDiscardDraft,
  onRequestChange: changeRequest,
  pending,
  setPending,
}: ComposerProps & {
  pending: boolean;
  setPending: (pending: boolean) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const onRequestChange = (next: ComposerRequest) => changeRequest(next);
  const mode = request.mode;
  const task = request.task ?? null;
  const stopwatch = useStopwatch();
  const recorded = useTaskWorkSessions(mode === "proof" ? task : null);
  const tracked = summarizeWorkSessions(recorded.sessions);
  const isTracking = mode === "proof" && task?.id === stopwatch.active?.taskId;
  const [title, setTitle] = useState(
    draft?.title ??
      (request.mode === "task" ? (request.task?.title ?? "") : ""),
  );
  const [files, setFiles] = useState<File[]>(draft?.files ?? []);
  const [goalId, setGoalId] = useState<string | null>(
    draft && "goalId" in draft
      ? (draft.goalId ?? null)
      : (request.goal?.id ?? null),
  );
  const [note, setNote] = useState(draft?.note ?? "");
  const [startedAt, setStartedAt] = useState(
    () =>
      draft?.startedAt ??
      phoenixLocalDateTimeValue(new Date(Date.now() - 30 * 60_000)),
  );
  const [completedAt, setCompletedAt] = useState(
    () => draft?.completedAt ?? phoenixLocalDateTimeValue(),
  );
  const [step, setStep] = useState<"media" | "details">(draft?.step ?? "media");
  // biome-ignore lint/correctness/useExhaustiveDependencies: Each proof step needs a fresh scroll and focus position.
  useLayoutEffect(() => {
    // The footer stays mounted between proof steps, so focus would otherwise
    // remain on Back (or disappear with Next) instead of entering the new form.
    const form = formRef.current;
    if (form && !form.contains(document.activeElement))
      form.focus({ preventScroll: true });
    form?.scrollTo({ top: 0 });
  }, [step]);
  const [editTimes, setEditTimes] = useState(draft?.editTimes ?? false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  const [uploadStatus, setUploadStatus, uploadPercent] = useUploadStatus();
  const uploadedIds = useRef<string[] | null>(draft?.uploadedIds ?? null);
  const submitted = useRef(false);
  useEffect(() => {
    return () => {
      if (!submitted.current)
        onSaveDraft({
          title,
          goalId,
          files,
          note,
          startedAt,
          completedAt,
          step,
          editTimes,
          uploadedIds: uploadedIds.current,
        });
    };
  }, [
    title,
    goalId,
    files,
    note,
    startedAt,
    completedAt,
    step,
    editTimes,
    onSaveDraft,
  ]);
  const eligible = tasks.filter(
    (item) =>
      item.status !== "MISSED" &&
      (new Date(item.dueAt).getTime() > Date.now() ||
        !!item.proofSubmittedAt) &&
      (!item.proof || item.proof.reviewStatus === "CHALLENGED"),
  );
  const ready =
    mode === "task" || (mode === "proof" && task && step === "details");
  const start = parsePhoenixLocalDateTime(startedAt);
  const finish = parsePhoenixLocalDateTime(completedAt);
  const proofStart = tracked.startedAt
    ? phoenixLocalDateTimeValue(new Date(tracked.startedAt), true)
    : startedAt;
  const proofEnd = tracked.endedAt
    ? phoenixLocalDateTimeValue(new Date(tracked.endedAt), true)
    : completedAt;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (mode === "task" && !title.trim()) {
      setError("Give your task a title.");
      return;
    }
    setError(null);
    setPending(true);
    const release = holdAppRefresh();
    try {
      let response: Response;
      if (mode === "task") {
        response = await appFetch(
          task ? `/api/commitments/${task.id}` : "/api/commitments",
          {
            method: task ? "PATCH" : "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title,
              circleId,
              ...(!task ? { goalId } : {}),
            }),
          },
        );
      } else {
        if (!task || !files.length)
          throw new Error("Choose a task and attach your proof first.");
        if (recorded.loading)
          throw new Error(
            "Recorded times are still loading. Try again in a moment.",
          );
        if (recorded.error)
          throw new Error(
            "Could not load recorded time. Reopen the proof form to try again.",
          );
        if (isTracking)
          throw new Error("Stop your stopwatch before posting proof.");
        const mediaIds =
          uploadedIds.current ??
          (await uploadMedia(files, setUploadStatus, {
            deferProcessing: true,
          }));
        uploadedIds.current = mediaIds;
        response = await appFetch(`/api/commitments/${task.id}/proof`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mediaIds,
            note,
            startedAt: proofStart,
            completedAt: proofEnd,
          }),
        });
      }
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not save. Try again.");
      if (data.pending) {
        submitted.current = true;
        onDiscardDraft();
        onClose();
        window.dispatchEvent(new Event("pb:media-pending"));
        toast.add({
          title: "Upload complete",
          description: "Preparing your proof. We’ll post it when it’s ready.",
          type: "info",
        });
        router.push("/");
        return;
      }
      submitted.current = true;
      onDiscardDraft();
      onClose();
      toast.add({
        title:
          mode === "task"
            ? "Task saved. Make it happen."
            : mode === "proof"
              ? "Proof posted. Your friends can review it."
              : "Check-in posted.",
        type: "success",
      });
      router.push(
        mode === "task"
          ? !task && goalId
            ? `/goals/${goalId}`
            : "/profile?tab=tasks"
          : "/",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not reach the server. Try again.",
      );
    } finally {
      setPending(false);
      release();
    }
  }

  return (
    <>
      <form
        ref={formRef}
        tabIndex={-1}
        id="social-composer-form"
        onSubmit={submit}
        aria-busy={pending}
        className="min-h-0 overflow-y-auto px-5 pb-4 outline-none"
      >
        {mode === "choose" && (
          <div className="composer-action-list flex flex-col gap-1">
            {(
              [
                {
                  mode: "task",
                  title: "Add a task",
                  description: "Say what you’re going to do.",
                  icon: ClipboardList,
                },
                {
                  mode: "proof",
                  title: "Post proof",
                  description: "Show your circle what you finished.",
                  icon: Camera,
                },
                {
                  mode: "check-in",
                  title: "Check in",
                  description: "Share your mood and what’s on your mind.",
                  icon: MessageCircle,
                },
              ] as const
            ).map((item) => (
              <Button
                key={item.mode}
                variant="ghost"
                className="composer-choice"
                onClick={() => onRequestChange({ mode: item.mode })}
              >
                <item.icon data-icon="inline-start" />
                <span className="flex flex-1 flex-col items-start gap-1">
                  <span>{item.title}</span>
                  <span className="font-normal text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                <ArrowRight data-icon="inline-end" />
              </Button>
            ))}
            <Button
              variant="ghost"
              className="composer-choice"
              onClick={() => {
                onClose();
                router.push(newStreakHref);
              }}
            >
              <Flame data-icon="inline-start" />
              <span className="flex flex-1 flex-col items-start gap-1">
                <span>Start a streak</span>
                <span className="font-normal text-muted-foreground">
                  Quit something or build a daily habit.
                </span>
              </span>
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        )}
        {mode === "task" && (
          <FieldGroup>
            <Field data-disabled={pending}>
              <FieldLabel htmlFor="social-task-title">
                What will you do?
              </FieldLabel>
              <Input
                id="social-task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                placeholder="Finish the physics problem set"
                required
                disabled={pending}
                autoFocus
              />
            </Field>
            {!task && (
              <GoalPicker
                circleId={circleId}
                value={goalId}
                onChange={setGoalId}
                disabled={pending}
                initial={request.goal}
              />
            )}
          </FieldGroup>
        )}
        {mode === "proof" && !task && (
          <div className="flex flex-col gap-2">
            {eligible.map((item) => (
              <Button
                key={item.id}
                variant="outline"
                className="composer-choice"
                onClick={() => onRequestChange({ mode: "proof", task: item })}
              >
                <ClipboardList data-icon="inline-start" />
                <span className="flex-1 whitespace-normal text-left">
                  {item.title}
                </span>
                <ArrowRight data-icon="inline-end" />
              </Button>
            ))}
            {!eligible.length && (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ClipboardList />
                  </EmptyMedia>
                  <EmptyTitle>No tasks waiting for proof</EmptyTitle>
                </EmptyHeader>
                <Button onClick={() => onRequestChange({ mode: "task" })}>
                  <Plus data-icon="inline-start" /> Add a task
                </Button>
              </Empty>
            )}
          </div>
        )}
        {mode === "proof" && task && step === "media" && (
          <MediaPicker
            files={files}
            onChange={(next) => {
              setFiles(next);
              uploadedIds.current = null;
            }}
            disabled={pending}
            required
          />
        )}
        {mode === "proof" && task && step === "details" && (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="social-caption">
                Add a caption{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </FieldLabel>
              <Textarea
                id="social-caption"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                disabled={pending}
                placeholder="A little context for your friends…"
              />
            </Field>
            {recorded.error && (
              <Alert variant="destructive">
                <AlertTitle>Could not load recorded time</AlertTitle>
                <AlertDescription className="flex flex-col gap-2">
                  {recorded.error}
                  <Button
                    variant="outline"
                    disabled={recorded.loading}
                    onClick={stopwatch.changed}
                  >
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {isTracking && stopwatch.active && (
              <Alert>
                <AlertTitle>Your stopwatch is still running</AlertTitle>
                <AlertDescription className="flex flex-col gap-2">
                  Stop to save this session before posting proof.
                  <Button
                    disabled={stopwatch.pending}
                    onClick={() =>
                      stopwatch.active &&
                      void stopwatch.stop(stopwatch.active.id)
                    }
                  >
                    Stop stopwatch
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {tracked.count > 0 ? (
              <Field>
                <FieldLabel>Recorded work</FieldLabel>
                <p className="font-mono tabular-nums">
                  {formatStopwatch(tracked.milliseconds)}
                </p>
                <FieldDescription>
                  {tracked.count} {tracked.count === 1 ? "session" : "sessions"}
                  , with breaks excluded. Already saved to Timeblock. Select the
                  recorded time on the task to correct it.
                </FieldDescription>
              </Field>
            ) : (
              <Field>
                <FieldLabel>Time spent</FieldLabel>
                <Button
                  variant="outline"
                  className="h-auto justify-start py-3 whitespace-normal"
                  disabled={pending}
                  aria-expanded={editTimes}
                  aria-controls="social-proof-times"
                  onClick={() => setEditTimes(!editTimes)}
                >
                  <Clock3 data-icon="inline-start" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                    <span>
                      {start ? formatHistoryTime(start) : "Start time"} to{" "}
                      {finish ? formatHistoryTime(finish) : "finish time"}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {start && finish
                        ? `${formatDayShort(startedAt.slice(0, 10))}${startedAt.slice(0, 10) !== completedAt.slice(0, 10) ? ` to ${formatDayShort(completedAt.slice(0, 10))}` : ""} · `
                        : ""}
                      Phoenix time
                    </span>
                  </span>
                  <span>{editTimes ? "Done" : "Edit"}</span>
                </Button>
                <FieldDescription>
                  These times appear on your timeblock.
                </FieldDescription>
              </Field>
            )}
            {editTimes && !tracked.count && (
              <FieldGroup id="social-proof-times">
                <Field>
                  <FieldLabel htmlFor="social-start">Started</FieldLabel>
                  <Input
                    id="social-start"
                    type="datetime-local"
                    value={startedAt}
                    onChange={(e) => setStartedAt(e.target.value)}
                    required
                    disabled={pending}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="social-finish">Finished</FieldLabel>
                  <Input
                    id="social-finish"
                    type="datetime-local"
                    value={completedAt}
                    onChange={(e) => setCompletedAt(e.target.value)}
                    required
                    disabled={pending}
                  />
                </Field>
              </FieldGroup>
            )}
            <p className="text-sm text-muted-foreground">
              {files.length} attachment{files.length === 1 ? "" : "s"} ready to
              post.
            </p>
          </FieldGroup>
        )}
        {error && (
          <Alert ref={errorRef} variant="destructive" className="mt-4">
            <AlertTitle>
              {mode === "task" ? "Could not save task" : "Could not post"}
            </AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {pending && (
          <UploadStatus status={uploadStatus} percent={uploadPercent} />
        )}
      </form>
      {mode !== "choose" && (
        <SheetFooter className="flex-row border-t">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (mode === "proof" && task) {
                if (step === "details") setStep("media");
                else onRequestChange({ mode: "proof" });
              } else if (mode === "task" && task) {
                onClose();
              } else {
                onRequestChange({
                  mode: "choose",
                });
              }
            }}
          >
            <ArrowLeft data-icon="inline-start" />{" "}
            {mode === "task" && task ? "Cancel" : "Back"}
          </Button>
          {mode === "proof" && task && step === "media" && (
            <Button
              className="flex-1"
              disabled={pending || !files.length}
              onClick={() => setStep("details")}
            >
              Next
              <ArrowRight data-icon="inline-end" />
            </Button>
          )}
          {ready && (
            <Button
              className="flex-1"
              form="social-composer-form"
              type="submit"
              disabled={
                pending ||
                (mode === "proof" &&
                  (recorded.loading || !!recorded.error || isTracking))
              }
            >
              {pending && <Spinner data-icon="inline-start" />}
              {mode === "task"
                ? pending
                  ? "Saving task…"
                  : "Save task"
                : mode === "proof"
                  ? pending
                    ? "Posting proof…"
                    : "Post proof"
                  : pending
                    ? "Posting check-in…"
                    : "Post check-in"}
            </Button>
          )}
        </SheetFooter>
      )}
    </>
  );
}
