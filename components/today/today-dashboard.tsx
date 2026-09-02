"use client";

import {
  Bot,
  CalendarClock,
  Camera,
  CheckCircle2,
  CircleDashed,
  Pencil,
  Plus,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
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
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { dailyTaskLimit } from "@/lib/task-policy";
import { MidnightCountdown } from "./midnight-countdown";

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
    reviewStatus: "PENDING" | "APPROVED" | "CHALLENGED";
    aiStatus: "PENDING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  };
};

type CheckIn = {
  signal: "WORKING" | "CLEAR" | "AT_RISK";
  blocker: string | null;
} | null;

async function readError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "The server dropped the ball.";
}

function statusBadge(status: Task["status"]) {
  const labels = {
    OPEN: "Open",
    AWAITING_REVIEW: "Awaiting review",
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

function TaskDialog({ task }: { day: string; task?: Task }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(task?.title ?? "");
  const [definition, setDefinition] = useState(task?.definitionOfDone ?? "");

  // Reset form when dialog opens/closes or task identity changes (fixes stale "new task" data)
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setTitle(task?.title ?? "");
      setDefinition(task?.definitionOfDone ?? "");
      setError(null);
    } else {
      // Clear stale state when closing so next "Add task" starts blank
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
    const formData = new FormData(event.currentTarget);
    const data = {
      title,
      definitionOfDone: definition,
      revisionNote:
        String(formData.get("revisionNote") ?? "").trim() || undefined,
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
      title: task ? "Task renegotiated." : "Task locked in.",
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
            <DialogTitle>
              {task ? "Renegotiate before the deadline" : "Make a real promise"}
            </DialogTitle>
            <DialogDescription>
              Specific enough that your friends can verify it from a photo.
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
                    Task
                  </FieldLabel>
                  <Input
                    id={`title-${task?.id ?? "new"}`}
                    name="title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Finish calculus problem set"
                    required
                    maxLength={100}
                    className="h-11"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`definition-${task?.id ?? "new"}`}>
                    Definition of done
                  </FieldLabel>
                  <Textarea
                    id={`definition-${task?.id ?? "new"}`}
                    name="definitionOfDone"
                    value={definition}
                    onChange={(event) => setDefinition(event.target.value)}
                    placeholder="All 18 problems solved and checked"
                    required
                    maxLength={500}
                    className="min-h-24"
                  />
                  <FieldDescription>
                    “Study math” is not evidence. Name the finish line.
                  </FieldDescription>
                </Field>
                <Alert>
                  <CalendarClock />
                  <AlertTitle>Due tonight at midnight</AlertTitle>
                  <AlertDescription>
                    Phoenix time. Everyone shares the same deadline, refreshed
                    daily.
                  </AlertDescription>
                </Alert>
                {task && (
                  <Field>
                    <FieldLabel htmlFor={`note-${task.id}`}>
                      Why are you changing it?
                    </FieldLabel>
                    <Input
                      id={`note-${task.id}`}
                      name="revisionNote"
                      maxLength={240}
                      placeholder="Schedule changed; scope is still honest"
                      className="h-11"
                    />
                  </Field>
                )}
              </FieldGroup>
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>That did not work.</AlertTitle>
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
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fileRef.current?.files?.[0]) {
      setError("Attach a photo first.");
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
      title: "Proof posted.",
      description: "The AI read is advisory. Your friends still decide.",
      type: "success",
    });
    setOpen(false);
    setPending(false);
    setFileName(null);
    router.refresh();
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setError(null);
      setPending(false);
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button size="sm" className="touch-manipulation" />}
      >
        <Camera data-icon="inline-start" />
        {task.proof?.reviewStatus === "CHALLENGED"
          ? "Replace proof"
          : "Upload proof"}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-hidden p-0 sm:max-w-lg">
        <div className="flex max-h-[90dvh] flex-col">
          <DialogHeader className="shrink-0 p-6 pb-0">
            <DialogTitle>Photo receipt for “{task.title}”</DialogTitle>
            <DialogDescription>
              Metadata gets stripped. The sanitized photo is visible only to
              this squad.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <form
              onSubmit={submit}
              id={`proof-form-${task.id}`}
              className="flex flex-col gap-4 p-6"
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`proof-${task.id}`}>
                    Proof photo
                  </FieldLabel>
                  {/* biome-ignore lint/a11y/useSemanticElements: dropzone uses div to avoid nested button with clear action */}
                  <div
                    className="relative flex flex-col gap-2 rounded-xl border border-dashed bg-muted/40 p-4 transition-colors hover:border-primary/40 hover:bg-muted/60 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 cursor-pointer"
                    onClick={() => fileRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileRef.current?.click();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label="Choose proof photo"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Upload className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {fileName ?? "Tap to choose photo"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PNG, JPEG, WebP, or HEIC. Max 6 MB.
                        </p>
                      </div>
                      {fileName && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (fileRef.current) fileRef.current.value = "";
                            setFileName(null);
                          }}
                          aria-label="Clear file"
                        >
                          <X />
                        </Button>
                      )}
                    </div>
                    <Input
                      ref={fileRef}
                      id={`proof-${task.id}`}
                      name="image"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/heic"
                      className="sr-only"
                      tabIndex={-1}
                      onChange={(e) =>
                        setFileName(e.target.files?.[0]?.name ?? null)
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <FieldDescription>
                    Your location data is removed automatically.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`proof-note-${task.id}`}>
                    Note to the squad
                  </FieldLabel>
                  <Textarea
                    id={`proof-note-${task.id}`}
                    name="note"
                    maxLength={500}
                    placeholder="What the photo shows, if it is not obvious"
                    className="min-h-24"
                  />
                </Field>
              </FieldGroup>
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
              {pending ? "Sanitizing and reading…" : "Post proof"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CheckInCard({ initial }: { initial: CheckIn }) {
  const router = useRouter();
  const [signal, setSignal] = useState<NonNullable<CheckIn>["signal"]>(
    initial?.signal ?? "WORKING",
  );
  const [blocker, setBlocker] = useState(initial?.blocker ?? "");
  const [pending, setPending] = useState(false);
  return (
    <Card>
      <CardHeader>
        <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <Bot />
        </div>
        <CardTitle>Quick check-in</CardTitle>
        <CardDescription>
          Tell the squad where the day actually stands.
        </CardDescription>
        {initial && (
          <CardAction>
            <Badge variant="outline">Saved</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
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
            <FieldLabel htmlFor="blocker">Blocker</FieldLabel>
            <Textarea
              id="blocker"
              value={blocker}
              onChange={(event) => setBlocker(event.target.value)}
              placeholder="Optional. What is getting in the way?"
              maxLength={500}
              className="min-h-20"
            />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter>
        <Button
          disabled={pending}
          size="lg"
          className="w-full sm:w-auto touch-manipulation"
          onClick={async () => {
            setPending(true);
            const response = await fetch("/api/check-in", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ signal, blocker }),
            });
            toast.add({
              title: response.ok ? "Squad updated." : await readError(response),
              type: response.ok ? "success" : "error",
            });
            setPending(false);
            router.refresh();
          }}
        >
          {pending && <Spinner data-icon="inline-start" />}
          Save check-in
        </Button>
      </CardFooter>
    </Card>
  );
}

export function TodayDashboard({
  day,
  tasks,
  checkIn,
}: {
  day: string;
  tasks: Task[];
  checkIn: CheckIn;
}) {
  const verified = tasks.filter((task) => task.status === "VERIFIED").length;
  const awaiting = tasks.filter(
    (task) => task.status === "AWAITING_REVIEW",
  ).length;
  const percent = tasks.length
    ? Math.round((verified / tasks.length) * 100)
    : 0;
  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-2xl flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Phoenix · {day}</Badge>
            <MidnightCountdown />
            {awaiting > 0 && (
              <Badge variant="outline">{awaiting} awaiting review</Badge>
            )}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Promises. Then go play.
          </h1>
          <p className="max-w-xl text-sm text-balance text-muted-foreground md:text-base">
            Put down the schoolwork that earns your free time. Specific,
            verifiable, due at midnight.
          </p>
        </div>
        {tasks.length < dailyTaskLimit && (
          <div className="shrink-0">
            <TaskDialog day={day} />
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <CalendarClock />
          </div>
          <CardTitle>Today’s board</CardTitle>
          <CardDescription>
            {tasks.length}/{dailyTaskLimit} tasks set · {verified} verified
            {awaiting > 0 ? ` · ${awaiting} in review` : ""}
          </CardDescription>
          <CardAction>
            <Badge
              variant={
                percent === 100 && tasks.length > 0 ? "default" : "secondary"
              }
            >
              {percent}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Progress
            value={percent}
            aria-label={`${verified} of ${tasks.length} promises verified`}
          />
          <ItemGroup className="gap-3">
            {tasks.map((task) => (
              <Item
                key={task.id}
                variant="outline"
                className="flex-col items-stretch gap-3 p-4 sm:flex-row sm:items-start"
              >
                <ItemMedia variant="icon" className="hidden sm:flex">
                  {task.status === "VERIFIED" ? (
                    <CheckCircle2 />
                  ) : (
                    <CalendarClock />
                  )}
                </ItemMedia>
                <ItemContent className="min-w-0 flex-1">
                  <ItemTitle>{task.title}</ItemTitle>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {statusBadge(task.status)}{" "}
                    {task.proof?.isLate && (
                      <Badge variant="destructive">Late proof</Badge>
                    )}
                  </div>
                  <ItemDescription className="line-clamp-2">
                    {task.definitionOfDone}
                  </ItemDescription>
                  <ItemDescription className="text-xs tabular-nums">
                    Due midnight · Phoenix · {task.day}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="w-full flex-row flex-wrap justify-start sm:w-auto sm:justify-end">
                  {(task.status === "OPEN" ||
                    task.status === "RENEGOTIATED") && (
                    <TaskDialog day={day} task={task} />
                  )}
                  {(!task.proof ||
                    task.proof.reviewStatus === "CHALLENGED") && (
                    <ProofDialog task={task} />
                  )}
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
          {tasks.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Bot />
                </EmptyMedia>
                <EmptyTitle>No promises yet</EmptyTitle>
                <EmptyDescription>
                  A blank board does not count as being “flexible.” Add the work
                  that earns your free time.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
      <CheckInCard initial={checkIn} />
    </>
  );
}
