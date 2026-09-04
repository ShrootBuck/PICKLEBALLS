"use client";

import {
  CalendarClock,
  Camera,
  CheckCircle2,
  CircleDashed,
  History,
  Pencil,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  SocialReplyThread,
  type ThreadReply,
} from "@/components/squad/social-reply-thread";
import { OnboardingCard } from "@/components/today/onboarding-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  formatDayLong,
  formatHistoryTime,
  phoenixLocalDateTimeValue,
} from "@/lib/time";

type ProofReview = {
  id: string;
  decision: "APPROVED" | "CHALLENGED";
  note: string | null;
  createdAt: string;
  reviewerName: string;
  reviewerId: string;
  replies: ThreadReply[];
};

type Task = {
  id: string;
  day: string;
  title: string;
  definitionOfDone: string;
  dueAt: string;
  status: "OPEN" | "AWAITING_REVIEW" | "VERIFIED" | "MISSED" | "RENEGOTIATED";
  proof: null | {
    id: string;
    isLate: boolean;
    ownerNote: string | null;
    reviewStatus: "PENDING" | "APPROVED" | "CHALLENGED";
    aiStatus: "PENDING" | "SUCCEEDED" | "FAILED";
    reviews: ProofReview[];
  };
};

type DailySignal = "YAY" | "NAY" | "WORKING" | "CLEAR" | "AT_RISK";
type CurrentSignal = "YAY" | "NAY";

type CheckIn = {
  signal: DailySignal;
  blocker: string | null;
} | null;

type CheckInHistoryItem = {
  id: string;
  signal: NonNullable<CheckIn>["signal"];
  blocker: string | null;
  createdAt: string;
};

async function readError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "Server fumbled it. Try again.";
}

function statusBadge(status: Task["status"]) {
  const labels = {
    OPEN: "Open",
    AWAITING_REVIEW: "Needs verdict",
    VERIFIED: "Verified",
    MISSED: "Missed",
    RENEGOTIATED: "Renegotiated",
  };
  if (status === "MISSED")
    return (
      <Badge variant="destructive">
        <TriangleAlert />
        {labels[status]}
      </Badge>
    );
  if (status === "VERIFIED")
    return (
      <Badge variant="default">
        <CheckCircle2 />
        {labels[status]}
      </Badge>
    );
  if (status === "OPEN" || status === "RENEGOTIATED")
    return (
      <Badge variant="outline">
        <CircleDashed />
        {labels[status]}
      </Badge>
    );
  return <Badge variant="secondary">{labels[status]}</Badge>;
}

function signalBadge(signal: CheckInHistoryItem["signal"]) {
  if (signal === "NAY" || signal === "AT_RISK")
    return <Badge variant="destructive">Nay</Badge>;
  return <Badge variant="default">Yay</Badge>;
}

function currentSignal(signal?: DailySignal): CurrentSignal {
  return signal === "NAY" || signal === "AT_RISK" ? "NAY" : "YAY";
}

function ProofFeedback({
  proof,
  currentUserId,
}: {
  proof: NonNullable<Task["proof"]>;
  currentUserId: string;
}) {
  if (proof.reviews.length === 0) return null;
  return (
    <ItemGroup className="gap-2">
      {proof.reviews.map((review) => (
        <Item key={review.id} size="sm" variant="muted">
          <ItemContent>
            <ItemHeader>
              <ItemTitle className="text-[13px]">
                {review.reviewerName}
                {review.reviewerId === currentUserId ? " (you)" : ""}
              </ItemTitle>
              <Badge
                variant={
                  review.decision === "CHALLENGED" ? "destructive" : "default"
                }
              >
                {review.decision === "CHALLENGED" ? "Challenged" : "Approved"}
              </Badge>
            </ItemHeader>
            {review.note ? (
              <ItemDescription className="text-sm text-foreground">
                {review.note}
              </ItemDescription>
            ) : (
              <ItemDescription>No note. Just a vote.</ItemDescription>
            )}
            <div className="mt-2">
              <SocialReplyThread
                targetType="REVIEW"
                targetId={review.id}
                initialReplies={review.replies}
                currentUserId={currentUserId}
                compact
              />
            </div>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}

function TaskDialog({
  task,
  onSaved,
}: {
  task?: Task;
  onSaved?: (saved: {
    id: string;
    day: string;
    title: string;
    definitionOfDone: string;
    dueAt: string;
    status: Task["status"];
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(task?.title ?? "");
  const [definition, setDefinition] = useState(task?.definitionOfDone ?? "");

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setTitle(task?.title ?? "");
      setDefinition(task?.definitionOfDone ?? "");
      setError(null);
    } else {
      if (!task) {
        setTitle("");
        setDefinition("");
      }
      setError(null);
      setPending(false);
    }
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = {
      title,
      definitionOfDone: definition,
    };
    try {
      const response = await fetch(
        task ? `/api/commitments/${task.id}` : "/api/commitments",
        {
          method: task ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!response.ok) {
        setError(await readError(response));
        setPending(false);
        return;
      }
      const body = (await response.json()) as {
        task: {
          id: string;
          day: string;
          title: string;
          definitionOfDone: string;
          dueAt: string;
          status: Task["status"];
        };
      };
      // Local update, no full-page refresh: keeps scroll, drafts, and vibes.
      onSaved?.({
        id: body.task.id,
        day: body.task.day.slice(0, 10),
        title: body.task.title,
        definitionOfDone: body.task.definitionOfDone,
        dueAt: body.task.dueAt,
        status: body.task.status,
      });
      toast.add({
        title: task
          ? "Renegotiated. No excuses now."
          : "Locked in. No bullshit.",
        type: "success",
      });
      setOpen(false);
      setPending(false);
    } catch {
      setError("Could not reach the server. Check your wifi and try again.");
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant={task ? "outline" : "default"}
            size={task ? "sm" : "default"}
            className="touch-manipulation"
          />
        }
      >
        {task ? (
          <Pencil data-icon="inline-start" />
        ) : (
          <Plus data-icon="inline-start" />
        )}
        {task ? "Edit" : "Add task"}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-hidden p-0 sm:max-w-lg">
        <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
          <DialogHeader className="shrink-0 p-4 pb-0 sm:p-6 sm:pb-0">
            <DialogTitle className="text-xl tracking-tight">
              {task ? "Renegotiate before midnight" : "Make a real promise"}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Specific enough that the squad can verify it from one photo. No
              vague bullshit.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <form
              onSubmit={submit}
              id={`task-form-${task?.id ?? "new"}`}
              className="flex flex-col gap-4 p-4 sm:p-6"
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`title-${task?.id ?? "new"}`}>
                    What are you actually doing?
                  </FieldLabel>
                  <Input
                    id={`title-${task?.id ?? "new"}`}
                    name="title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Finish calc problem set, all 18, checked"
                    required
                    maxLength={100}
                    className="h-11"
                    aria-invalid={Boolean(error)}
                    aria-describedby={
                      error ? `task-error-${task?.id ?? "new"}` : undefined
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`definition-${task?.id ?? "new"}`}>
                    How do we know you did it?
                  </FieldLabel>
                  <Textarea
                    id={`definition-${task?.id ?? "new"}`}
                    name="definitionOfDone"
                    value={definition}
                    onChange={(event) => setDefinition(event.target.value)}
                    placeholder="Photo of every solved page. No crop tricks."
                    required
                    maxLength={500}
                    className="min-h-24"
                    aria-invalid={Boolean(error)}
                    aria-describedby={
                      error ? `task-error-${task?.id ?? "new"}` : undefined
                    }
                  />
                  <FieldDescription>
                    “Study math” proves nothing. Name the finish line.
                  </FieldDescription>
                </Field>
                <Alert>
                  <CalendarClock />
                  <AlertTitle>Due tonight at midnight</AlertTitle>
                  <AlertDescription>
                    Same deadline for everyone. No extensions.
                  </AlertDescription>
                </Alert>
              </FieldGroup>
              {error && (
                <Alert
                  variant="destructive"
                  id={`task-error-${task?.id ?? "new"}`}
                >
                  <AlertTitle>Nope.</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </form>
            <ScrollBar orientation="vertical" />
          </ScrollArea>
          <DialogFooter className="mx-0 mb-0 shrink-0">
            <Button
              type="submit"
              form={`task-form-${task?.id ?? "new"}`}
              disabled={pending}
              className="w-full sm:w-auto touch-manipulation"
            >
              {pending && <Spinner data-icon="inline-start" />}
              {task ? "Save revision" : "Lock it in"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProofDialog({
  task,
  onProof,
}: {
  task: Task;
  onProof?: (
    taskId: string,
    proof: NonNullable<Task["proof"]>,
    status: Task["status"],
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [startedAt, setStartedAt] = useState(() =>
    phoenixLocalDateTimeValue(new Date(Date.now() - 30 * 60 * 1000)),
  );
  const [completedAt, setCompletedAt] = useState(() =>
    phoenixLocalDateTimeValue(),
  );
  const isReplace = task.proof?.reviewStatus === "CHALLENGED";
  const isLate = task.status === "MISSED";
  const [formKey, setFormKey] = useState(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) {
      setError("Attach a photo first. Words are cheap.");
      return;
    }
    const description = formData.get("note")?.toString().trim();
    if (!description && !confirmEmpty) {
      setConfirmEmpty(true);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/commitments/${task.id}/proof`, {
        method: "POST",
        // Reuse the FormData captured above: the React synthetic event's
        // currentTarget can be detached after the setPending re-render.
        body: formData,
      });
      if (!response.ok) {
        setError(await readError(response));
        setPending(false);
        return;
      }
      const body = (await response.json()) as {
        proof: {
          id: string;
          isLate: boolean;
          ownerNote: string | null;
          reviewStatus: NonNullable<Task["proof"]>["reviewStatus"];
          aiStatus: NonNullable<Task["proof"]>["aiStatus"];
        };
      };
      // Solo circles verify on post; everyone else waits for a verdict.
      const status: Task["status"] =
        body.proof.reviewStatus === "APPROVED" ? "VERIFIED" : "AWAITING_REVIEW";
      onProof?.(
        task.id,
        {
          id: body.proof.id,
          isLate: body.proof.isLate,
          ownerNote: body.proof.ownerNote,
          reviewStatus: body.proof.reviewStatus,
          aiStatus: body.proof.aiStatus,
          reviews: [],
        },
        status,
      );
      toast.add({
        title: "Proof posted. Friends decide now.",
        type: "success",
      });
      setOpen(false);
      setPending(false);
      setNote("");
      setConfirmEmpty(false);
      setFormKey((key) => key + 1);
    } catch {
      setError("Could not reach the server. Check your wifi and try again.");
      setPending(false);
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      const now = new Date();
      setStartedAt(
        phoenixLocalDateTimeValue(new Date(now.getTime() - 30 * 60 * 1000)),
      );
      setCompletedAt(phoenixLocalDateTimeValue(now));
    } else {
      setError(null);
      setPending(false);
      setNote("");
      setConfirmEmpty(false);
      setFormKey((key) => key + 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button size="sm" className="touch-manipulation" />}
      >
        <Camera data-icon="inline-start" />
        {isReplace
          ? "Replace proof"
          : isLate
            ? "Upload late proof"
            : "Upload proof"}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-hidden p-0 sm:max-w-lg">
        <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
          <DialogHeader className="shrink-0 p-4 pb-0 sm:p-6 sm:pb-0">
            <DialogTitle className="text-xl tracking-tight">
              Prove it: {task.title}
            </DialogTitle>
            <DialogDescription>
              Photo or it did not happen. Blurry pics get challenged.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <form
              onSubmit={submit}
              key={formKey}
              id={`proof-form-${task.id}`}
              className="flex flex-col gap-4 p-4 sm:p-6"
            >
              <FieldGroup>
                <FileUpload
                  id={`proof-${task.id}`}
                  label="Proof photo"
                  description="PNG, JPEG, WebP, HEIC, or HEIF. Max 6 MB. Location data gets stripped automatically."
                  required
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`proof-started-${task.id}`}>
                      Started
                    </FieldLabel>
                    <Input
                      id={`proof-started-${task.id}`}
                      name="startedAt"
                      type="datetime-local"
                      value={startedAt}
                      max={phoenixLocalDateTimeValue()}
                      onChange={(event) => setStartedAt(event.target.value)}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`proof-completed-${task.id}`}>
                      Finished
                    </FieldLabel>
                    <Input
                      id={`proof-completed-${task.id}`}
                      name="completedAt"
                      type="datetime-local"
                      value={completedAt}
                      max={phoenixLocalDateTimeValue()}
                      onChange={(event) => setCompletedAt(event.target.value)}
                      required
                    />
                  </Field>
                </div>
                <FieldDescription>
                  Prefilled as the last 30 minutes. Fix it now so Monday&apos;s
                  timeblock writes itself.
                </FieldDescription>
                <Field>
                  <FieldLabel htmlFor={`proof-note-${task.id}`}>
                    What are we looking at?
                  </FieldLabel>
                  <Textarea
                    id={`proof-note-${task.id}`}
                    name="note"
                    value={note}
                    onChange={(event) => {
                      setNote(event.target.value);
                      if (event.target.value.trim()) setConfirmEmpty(false);
                    }}
                    maxLength={500}
                    placeholder="Page numbers, scores, whatever makes it obvious"
                    className="min-h-24"
                  />
                </Field>
              </FieldGroup>
              {confirmEmpty && (
                <Alert>
                  <TriangleAlert />
                  <AlertTitle>No description. Still submit?</AlertTitle>
                  <AlertDescription>
                    {isReplace
                      ? "This replaces your challenged proof. Friends will judge a bare photo."
                      : "First proof only — you cannot add one later. Friends will judge a bare photo."}
                  </AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Upload failed.</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </form>
            <ScrollBar orientation="vertical" />
          </ScrollArea>
          <DialogFooter className="mx-0 mb-0 shrink-0">
            {confirmEmpty ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmEmpty(false)}
                  disabled={pending}
                  className="w-full sm:w-auto touch-manipulation"
                >
                  Keep editing
                </Button>
                <Button
                  type="submit"
                  form={`proof-form-${task.id}`}
                  disabled={pending}
                  className="w-full sm:w-auto touch-manipulation"
                  size="lg"
                >
                  {pending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Camera data-icon="inline-start" />
                  )}
                  {pending ? "Reading it…" : "Submit without it"}
                </Button>
              </>
            ) : (
              <Button
                type="submit"
                form={`proof-form-${task.id}`}
                disabled={pending}
                className="w-full touch-manipulation"
                size="lg"
              >
                {pending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Camera data-icon="inline-start" />
                )}
                {pending ? "Reading it…" : "Post proof"}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CheckInCard({
  initial,
  history,
  onPosted,
}: {
  initial: CheckIn;
  history: CheckInHistoryItem[];
  onPosted?: (
    checkIn: NonNullable<CheckIn>,
    historyItem: CheckInHistoryItem,
  ) => void;
}) {
  const [signal, setSignal] = useState<CurrentSignal>(() =>
    currentSignal(initial?.signal),
  );
  const [blocker, setBlocker] = useState("");
  const [pending, setPending] = useState(false);
  // Latest post wins; the parent feeds the new check-in back as `initial`.
  const initialSignal = initial?.signal;
  useEffect(() => {
    if (initialSignal) setSignal(currentSignal(initialSignal));
  }, [initialSignal]);

  async function post() {
    setPending(true);
    try {
      const response = await fetch("/api/check-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signal, blocker }),
      });
      if (!response.ok) {
        toast.add({ title: await readError(response), type: "error" });
        setPending(false);
        return;
      }
      const body = (await response.json()) as {
        checkIn: {
          id: string;
          signal: CurrentSignal;
          blocker: string | null;
          updatedAt: string;
        };
        update: { id: string };
      };
      // Local update, no full-page refresh.
      onPosted?.(
        { signal: body.checkIn.signal, blocker: body.checkIn.blocker },
        {
          id: body.update.id,
          signal: body.checkIn.signal,
          blocker: body.checkIn.blocker,
          createdAt: body.checkIn.updatedAt,
        },
      );
      toast.add({ title: "Posted. No take-backs.", type: "success" });
      setBlocker("");
      setPending(false);
    } catch {
      toast.add({
        title: "Could not reach the server. Check your wifi and try again.",
        type: "error",
      });
      setPending(false);
    }
  }

  return (
    <Card size="sm" className="xl:sticky xl:top-6">
      <CardHeader>
        <CardTitle className="text-lg tracking-tight">
          How is today really going?
        </CardTitle>
        <CardDescription>
          Post it. Old posts stay below. No rewriting history.
        </CardDescription>
        {initial ? (
          <CardAction>
            <Badge variant="outline">Posted</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        <FieldGroup>
          <Field>
            <FieldTitle id="check-in-signal">Status</FieldTitle>
            <ToggleGroup
              value={[signal ?? "YAY"]}
              onValueChange={(value) =>
                value[0] && setSignal(value[0] as CurrentSignal)
              }
              aria-labelledby="check-in-signal"
              variant="outline"
              spacing={2}
              className="w-full"
            >
              <ToggleGroupItem value="YAY" className="flex-1">
                Yay
              </ToggleGroupItem>
              <ToggleGroupItem value="NAY" className="flex-1">
                Nay
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="blocker">What is in the way?</FieldLabel>
            <Textarea
              id="blocker"
              value={blocker}
              onChange={(event) => setBlocker(event.target.value)}
              placeholder="Be honest. Phone? Distractions? Laziness?"
              maxLength={500}
              className="min-h-20"
            />
          </Field>
        </FieldGroup>
        {history.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <History className="size-3.5" />
              Today ({history.length})
            </p>
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-0.5">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl bg-muted/60 px-3 py-3"
                >
                  <div className="flex items-center gap-2">
                    {signalBadge(item.signal)}
                    <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                      {formatHistoryTime(item.createdAt)}
                    </span>
                  </div>
                  {item.blocker ? (
                    <p className="text-sm leading-snug text-pretty">
                      {item.blocker}
                    </p>
                  ) : (
                    <p className="text-[13px] text-muted-foreground italic">
                      No note. Just vibes.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <Button
          disabled={pending}
          className="w-full touch-manipulation"
          onClick={post}
        >
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Post check-in
        </Button>
      </CardFooter>
    </Card>
  );
}

export function TodayDashboard({
  day,
  currentUserId,
  tasks: initialTasks,
  checkIn: initialCheckIn,
  checkInHistory: initialHistory,
}: {
  day: string;
  currentUserId: string;
  tasks: Task[];
  checkIn: CheckIn;
  checkInHistory: CheckInHistoryItem[];
}) {
  // Local-first board: mutations update state directly instead of a full
  // router.refresh(). The page keys this component by day, so state
  // re-seeds automatically when the day rolls over.
  const [tasks, setTasks] = useState(initialTasks);
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkInHistory, setCheckInHistory] = useState(initialHistory);
  const verified = tasks.filter((task) => task.status === "VERIFIED").length;
  const awaiting = tasks.filter(
    (task) => task.status === "AWAITING_REVIEW",
  ).length;
  const missed = tasks.filter((task) => task.status === "MISSED").length;
  const percent = tasks.length
    ? Math.round((verified / tasks.length) * 100)
    : 0;
  const hasActions = (task: Task) =>
    task.status === "OPEN" ||
    task.status === "RENEGOTIATED" ||
    !task.proof ||
    task.proof.reviewStatus === "CHALLENGED";
  const friendlyDay = formatDayLong(day);

  const headline =
    tasks.length === 0
      ? "Nothing locked in yet"
      : verified === tasks.length
        ? "Clean sweep. Touch grass."
        : missed > 0
          ? `${missed} missed. Yikes.`
          : `${tasks.length - verified} left to prove`;

  function handleTaskSaved(saved: {
    id: string;
    day: string;
    title: string;
    definitionOfDone: string;
    dueAt: string;
    status: Task["status"];
  }) {
    setTasks((prev) =>
      prev.some((item) => item.id === saved.id)
        ? prev.map((item) =>
            item.id === saved.id ? { ...item, ...saved } : item,
          )
        : [...prev, { ...saved, proof: null }],
    );
  }

  function handleProof(
    taskId: string,
    proof: NonNullable<Task["proof"]>,
    status: Task["status"],
  ) {
    setTasks((prev) =>
      prev.map((item) =>
        item.id === taskId ? { ...item, proof, status } : item,
      ),
    );
  }

  function handleCheckInPosted(
    next: NonNullable<CheckIn>,
    item: CheckInHistoryItem,
  ) {
    setCheckIn(next);
    setCheckInHistory((prev) => [item, ...prev]);
  }

  return (
    <>
      <PageHeader
        title="Today"
        description={`Did you get shit done or just bullshit? ${tasks.length} locked, ${verified} verified.`}
        actions={<TaskDialog onSaved={handleTaskSaved} />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[13px]">
            {friendlyDay}
          </Badge>
          {awaiting > 0 ? (
            <Badge variant="outline">{awaiting} need a verdict</Badge>
          ) : null}
        </div>
      </PageHeader>

      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
              <span className="text-sm font-medium tracking-tight">
                {headline}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {verified} of {tasks.length} verified, {percent}%
              </span>
            </div>
            <Progress
              value={percent}
              aria-label={`${verified} of ${tasks.length} promises verified`}
            />
          </div>

          {tasks.length === 0 ? (
            <OnboardingCard action={<TaskDialog onSaved={handleTaskSaved} />} />
          ) : (
            <div className="flex flex-col gap-3">
              {tasks.map((task) => (
                <Card key={task.id} size="sm">
                  <CardHeader>
                    <CardTitle className="text-[15px] leading-snug tracking-tight text-balance">
                      {task.title}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 text-sm leading-relaxed">
                      {task.definitionOfDone}
                    </CardDescription>
                    <CardAction className="flex flex-col items-end gap-1">
                      {statusBadge(task.status)}
                      {task.proof?.isLate ? (
                        <Badge variant="destructive">Late proof</Badge>
                      ) : null}
                    </CardAction>
                  </CardHeader>
                  {task.proof &&
                  (task.proof.ownerNote || task.proof.reviews.length > 0) ? (
                    <CardContent className="flex flex-col gap-3">
                      {task.proof.ownerNote ? (
                        <p className="text-sm text-pretty text-muted-foreground">
                          “{task.proof.ownerNote}”
                        </p>
                      ) : null}
                      <ProofFeedback
                        proof={task.proof}
                        currentUserId={currentUserId}
                      />
                    </CardContent>
                  ) : null}
                  {hasActions(task) ? (
                    <CardFooter className="justify-stretch gap-2 sm:justify-end [&_[data-slot=button]]:flex-1 sm:[&_[data-slot=button]]:flex-none">
                      {(task.status === "OPEN" ||
                        task.status === "RENEGOTIATED") && (
                        <TaskDialog task={task} onSaved={handleTaskSaved} />
                      )}
                      {(!task.proof ||
                        task.proof.reviewStatus === "CHALLENGED") && (
                        <ProofDialog task={task} onProof={handleProof} />
                      )}
                    </CardFooter>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </div>
        <CheckInCard
          initial={checkIn}
          history={checkInHistory}
          onPosted={handleCheckInPosted}
        />
      </div>
    </>
  );
}
