"use client";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ClipboardList,
  Clock3,
  MessageCircle,
  Plus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { MediaPicker } from "@/components/media/media-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { appFetch, holdAppRefresh } from "@/lib/app-refresh";
import { uploadMedia } from "@/lib/media-upload";
import { postHref } from "@/lib/navigation";
import { proofFetch } from "@/lib/proof-fetch";
import type { SocialTask } from "@/lib/social-types";
import { phoenixDateKey, phoenixLocalDateTimeValue } from "@/lib/time";

type Mode = "choose" | "task" | "proof" | "check-in";
export type ComposerRequest = { mode: Mode; task?: SocialTask };
export type ComposerDraft = {
  title: string;
  definition: string;
  files: File[];
  note: string;
  signal: string;
  startedAt: string;
  completedAt: string;
  step: "media" | "details";
  editTimes: boolean;
  uploadedIds: string[] | null;
};

export function SocialComposer({
  request,
  tasks,
  circleId,
  day,
  onClose,
  draft,
  onSaveDraft,
  onDiscardDraft,
  onRequestChange,
}: {
  request: ComposerRequest;
  tasks: SocialTask[];
  circleId: string;
  day: string;
  onClose: () => void;
  draft?: ComposerDraft;
  onSaveDraft: (draft: ComposerDraft) => void;
  onDiscardDraft: () => void;
  onRequestChange: (request: ComposerRequest) => void;
}) {
  const router = useRouter();
  const mode = request.mode;
  const task = request.task ?? null;
  const [title, setTitle] = useState(
    draft?.title ??
      (request.mode === "task" ? (request.task?.title ?? "") : ""),
  );
  const [definition, setDefinition] = useState(
    draft?.definition ??
      (request.mode === "task" ? (request.task?.definitionOfDone ?? "") : ""),
  );
  const [files, setFiles] = useState<File[]>(draft?.files ?? []);
  const [note, setNote] = useState(draft?.note ?? "");
  const [signal, setSignal] = useState(draft?.signal ?? "YAY");
  const [startedAt, setStartedAt] = useState(
    () =>
      draft?.startedAt ??
      phoenixLocalDateTimeValue(new Date(Date.now() - 30 * 60_000)),
  );
  const [completedAt, setCompletedAt] = useState(
    () => draft?.completedAt ?? phoenixLocalDateTimeValue(),
  );
  const [step, setStep] = useState<"media" | "details">(draft?.step ?? "media");
  const [editTimes, setEditTimes] = useState(draft?.editTimes ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const uploadedIds = useRef<string[] | null>(draft?.uploadedIds ?? null);
  const submitted = useRef(false);
  useEffect(() => {
    return () => {
      if (!submitted.current)
        onSaveDraft({
          title,
          definition,
          files,
          note,
          signal,
          startedAt,
          completedAt,
          step,
          editTimes,
          uploadedIds: uploadedIds.current,
        });
    };
  }, [
    title,
    definition,
    files,
    note,
    signal,
    startedAt,
    completedAt,
    step,
    editTimes,
    onSaveDraft,
  ]);
  const eligible = tasks.filter(
    (item) =>
      item.day === day &&
      new Date(item.dueAt).getTime() > Date.now() &&
      (!item.proof || item.proof.reviewStatus === "CHALLENGED"),
  );
  const ready =
    mode === "task" ||
    mode === "check-in" ||
    (mode === "proof" && task && step === "details");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (day !== phoenixDateKey()) {
      setError(
        "This day has closed. Close this draft and refresh before starting a new one.",
      );
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
            body: JSON.stringify({ title, definitionOfDone: definition }),
          },
        );
      } else if (mode === "check-in") {
        response = await appFetch("/api/check-in", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ signal, blocker: note }),
        });
      } else {
        if (!task || !files.length)
          throw new Error("Choose a task and attach your proof first.");
        const mediaIds =
          uploadedIds.current ?? (await uploadMedia(files, setUploadStatus));
        uploadedIds.current = mediaIds;
        response = await proofFetch(`/api/commitments/${task.id}/proof`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mediaIds, note, startedAt, completedAt }),
        });
      }
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not save. Try again.");
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
          ? "/profile?tab=tasks"
          : postHref(
              circleId,
              mode === "proof" ? "proof" : "check-in",
              mode === "proof" ? data.proof.id : data.update.id,
            ),
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

  const heading = {
    choose: "What’s happening?",
    task: task ? "Edit your task" : "Make a commitment",
    proof: task?.proof ? "Another look. Better proof." : "Show the work",
    "check-in": "How’s it going?",
  }[mode];
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="social-composer"
        showCloseButton={!pending}
      >
        <SheetHeader>
          <SheetTitle>{heading}</SheetTitle>
          <SheetDescription>
            {mode === "choose"
              ? "A little accountability goes a long way."
              : mode === "task"
                ? "Set a clear finish line. Due tonight at midnight, Phoenix time."
                : mode === "proof"
                  ? (task?.title ?? "Pick the task you finished.")
                  : "A quick update for your circle."}
          </SheetDescription>
        </SheetHeader>
        <form
          id="social-composer-form"
          onSubmit={submit}
          className="min-h-0 overflow-y-auto px-5 pb-4"
        >
          {mode === "choose" && (
            <div className="flex flex-col gap-3">
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
                    description: "Going well, or need a hand?",
                    icon: MessageCircle,
                  },
                ] as const
              ).map((item) => (
                <Button
                  key={item.mode}
                  variant="outline"
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
            </div>
          )}
          {mode === "task" && (
            <FieldGroup>
              <Field>
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
                  autoFocus
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="social-task-definition">
                  What counts as done?
                </FieldLabel>
                <Textarea
                  id="social-task-definition"
                  value={definition}
                  onChange={(e) => setDefinition(e.target.value)}
                  maxLength={500}
                  placeholder="All 12 problems solved, with photos of the working."
                  required
                />
                <FieldDescription>
                  Give your friends something specific to verify.
                </FieldDescription>
              </Field>
            </FieldGroup>
          )}
          {mode === "check-in" && (
            <FieldGroup>
              <Field>
                <FieldLabel id="social-signal-label">Today feels…</FieldLabel>
                <ToggleGroup
                  value={[signal]}
                  onValueChange={(value) => {
                    if (value[0]) setSignal(value[0]);
                  }}
                  aria-labelledby="social-signal-label"
                  variant="outline"
                  spacing={2}
                >
                  <ToggleGroupItem value="YAY" className="flex-1">
                    <Check /> Going well
                  </ToggleGroupItem>
                  <ToggleGroupItem value="NAY" className="flex-1">
                    <MessageCircle /> Need a hand
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor="social-check-in">
                  Tell your circle{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </FieldLabel>
                <Textarea
                  id="social-check-in"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder="Finally understood that one problem. You know the one."
                />
              </Field>
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
                    <EmptyDescription>
                      Create a task to give your work a finish line.
                    </EmptyDescription>
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
                  placeholder="A little context for your friends…"
                />
              </Field>
              <Field>
                <FieldLabel>Time spent</FieldLabel>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => setEditTimes(!editTimes)}
                >
                  <Clock3 data-icon="inline-start" />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {startedAt.replace("T", " · ")} to {completedAt.slice(11)} ·
                    Phoenix
                  </span>
                  <span>{editTimes ? "Done" : "Edit"}</span>
                </Button>
                <FieldDescription>
                  Prefilled as the last 30 minutes. This goes on your timeblock.
                </FieldDescription>
              </Field>
              {editTimes && (
                <>
                  <Field>
                    <FieldLabel htmlFor="social-start">Started</FieldLabel>
                    <Input
                      id="social-start"
                      type="datetime-local"
                      value={startedAt}
                      onChange={(e) => setStartedAt(e.target.value)}
                      required
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
                    />
                  </Field>
                </>
              )}
              <p className="text-sm text-muted-foreground">
                {files.length} attachment{files.length === 1 ? "" : "s"} ready
                to post.
              </p>
            </FieldGroup>
          )}
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Could not post</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {pending && (
            <output className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              {uploadStatus || "Saving…"}
            </output>
          )}
        </form>
        {mode !== "choose" && (
          <SheetFooter className="flex-row border-t">
            {mode === "proof" && task && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (step === "details") setStep("media");
                  else onRequestChange({ mode: "proof" });
                }}
              >
                <ArrowLeft data-icon="inline-start" /> Back
              </Button>
            )}
            {mode === "proof" && task && step === "media" && (
              <Button
                className="flex-1"
                disabled={!files.length}
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
                disabled={pending}
              >
                {pending && <Spinner data-icon="inline-start" />}
                {mode === "task"
                  ? "Save task"
                  : mode === "proof"
                    ? "Post proof"
                    : "Post check-in"}
              </Button>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
