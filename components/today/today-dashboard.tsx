"use client";

import {
  Bot,
  CalendarClock,
  Camera,
  CheckCircle2,
  CircleDashed,
  History,
  Pencil,
  Plus,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
import { formatDayLong } from "@/lib/time";

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

type CheckIn = {
  signal: "WORKING" | "CLEAR" | "AT_RISK";
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
  if (signal === "AT_RISK") return <Badge variant="destructive">At risk</Badge>;
  if (signal === "CLEAR") return <Badge variant="default">Clear</Badge>;
  return <Badge variant="secondary">Working</Badge>;
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

const historyTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Phoenix",
  hour: "numeric",
  minute: "2-digit",
});

function TaskDialog({ task }: { day: string; task?: Task }) {
  const router = useRouter();
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
    toast.add({
      title: task ? "Renegotiated. No excuses now." : "Locked in. No bullshit.",
      type: "success",
    });
    setOpen(false);
    setPending(false);
    router.refresh();
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
      <DialogContent className="max-h-[90dvh] overflow-hidden p-0 sm:max-w-lg">
        <div className="flex max-h-[90dvh] flex-col">
          <DialogHeader className="shrink-0 p-6 pb-0">
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
              className="flex flex-col gap-4 p-6"
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
                <Alert variant="destructive">
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

function ProofDialog({ task }: { task: Task }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirmEmpty, setConfirmEmpty] = useState(false);
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
    const response = await fetch(`/api/commitments/${task.id}/proof`, {
      method: "POST",
      body: new FormData(event.currentTarget),
    });
    if (!response.ok) {
      setError(await readError(response));
      setPending(false);
      return;
    }
    toast.add({
      title: "Proof posted. Friends decide now.",
      type: "success",
    });
    setOpen(false);
    setPending(false);
    setNote("");
    setConfirmEmpty(false);
    setFormKey((key) => key + 1);
    router.refresh();
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
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
      <DialogContent className="max-h-[90dvh] overflow-hidden p-0 sm:max-w-lg">
        <div className="flex max-h-[90dvh] flex-col">
          <DialogHeader className="shrink-0 p-6 pb-0">
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
              className="flex flex-col gap-4 p-6"
            >
              <FieldGroup>
                <FileUpload
                  id={`proof-${task.id}`}
                  label="Proof photo"
                  description="PNG, JPEG, WebP, or HEIC. Max 6 MB. Location data gets stripped automatically."
                  required
                />
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
}: {
  initial: CheckIn;
  history: CheckInHistoryItem[];
}) {
  const router = useRouter();
  const [signal, setSignal] = useState<NonNullable<CheckIn>["signal"]>(
    initial?.signal ?? "WORKING",
  );
  const [blocker, setBlocker] = useState("");
  const [pending, setPending] = useState(false);
  // Server data goes stale after refresh; sync the toggle to latest post.
  // Same-value setState bails out, so depending on the whole object is safe.
  useEffect(() => {
    if (initial) setSignal(initial.signal);
  }, [initial]);
  const [coach, setCoach] = useState<string | null>(null);
  const [coachSteps, setCoachSteps] = useState<string[]>([]);
  const [coachPending, setCoachPending] = useState(false);

  async function post() {
    setPending(true);
    setCoach(null);
    const response = await fetch("/api/check-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signal, blocker }),
    });
    toast.add({
      title: response.ok ? "Posted. No take-backs." : await readError(response),
      type: response.ok ? "success" : "error",
    });
    if (response.ok) setBlocker("");
    setPending(false);
    router.refresh();
  }

  async function getUnblocked() {
    if (coachPending) return;
    setCoachPending(true);
    setCoach(null);
    setCoachSteps([]);
    try {
      const response = await fetch("/api/ai/unblock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signal, blocker }),
      });
      const result = (await response.json()) as {
        plan?: string;
        steps?: string[];
        error?: string;
      };
      if (!response.ok) {
        toast.add({
          title: result.error ?? "AI flopped. Figure it out yourself.",
          type: "error",
        });
        return;
      }
      setCoach(result.plan ?? null);
      setCoachSteps(result.steps ?? []);
    } catch {
      toast.add({ title: "AI is down right now.", type: "error" });
    } finally {
      setCoachPending(false);
    }
  }

  return (
    <Card size="sm" className="lg:sticky lg:top-20">
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
              value={[signal ?? "WORKING"]}
              onValueChange={(value) =>
                value[0] &&
                setSignal(value[0] as NonNullable<CheckIn>["signal"])
              }
              aria-labelledby="check-in-signal"
              variant="outline"
              spacing={2}
              className="w-full"
            >
              <ToggleGroupItem value="WORKING" className="flex-1">
                Working
              </ToggleGroupItem>
              <ToggleGroupItem value="CLEAR" className="flex-1">
                Clear
              </ToggleGroupItem>
              <ToggleGroupItem value="AT_RISK" className="flex-1">
                At risk
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
        {(coach || coachSteps.length > 0) && (
          <Alert>
            <Sparkles />
            <AlertTitle>Unfuck plan</AlertTitle>
            <AlertDescription className="flex flex-col gap-1.5">
              {coach ? <span>{coach}</span> : null}
              {coachSteps.length > 0 ? (
                <ol className="flex list-decimal flex-col gap-1 pl-4">
                  {coachSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              ) : null}
            </AlertDescription>
          </Alert>
        )}
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
                      {historyTime.format(new Date(item.createdAt))}
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
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={getUnblocked}
          disabled={coachPending}
        >
          {coachPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Bot data-icon="inline-start" />
          )}
          Get unblocked by AI
        </Button>
      </CardFooter>
    </Card>
  );
}

export function TodayDashboard({
  day,
  currentUserId,
  tasks,
  checkIn,
  checkInHistory,
}: {
  day: string;
  currentUserId: string;
  tasks: Task[];
  checkIn: CheckIn;
  checkInHistory: CheckInHistoryItem[];
}) {
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

  return (
    <>
      <PageHeader
        title="Today"
        description={`Did you get shit done or just bullshit? ${tasks.length} locked, ${verified} verified.`}
        actions={<TaskDialog day={day} />}
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

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
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
            <OnboardingCard action={<TaskDialog day={day} />} />
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
                    <CardFooter className="justify-end gap-2">
                      {(task.status === "OPEN" ||
                        task.status === "RENEGOTIATED") && (
                        <TaskDialog day={day} task={task} />
                      )}
                      {(!task.proof ||
                        task.proof.reviewStatus === "CHALLENGED") && (
                        <ProofDialog task={task} />
                      )}
                    </CardFooter>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </div>
        <CheckInCard initial={checkIn} history={checkInHistory} />
      </div>
    </>
  );
}
