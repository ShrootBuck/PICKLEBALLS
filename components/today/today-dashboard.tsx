"use client";

import {
  Bot,
  CalendarClock,
  Camera,
  CheckCircle2,
  Pencil,
  Plus,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
  const variant =
    status === "MISSED"
      ? "destructive"
      : status === "VERIFIED"
        ? "default"
        : "secondary";
  return <Badge variant={variant}>{labels[status]}</Badge>;
}

function TaskDialog({ day, task }: { day: string; task?: Task }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(task?.title ?? "");
  const [definition, setDefinition] = useState(task?.definitionOfDone ?? "");
  const dueTime = task
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Phoenix",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(task.dueAt))
    : "20:00";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = Object.fromEntries(new FormData(event.currentTarget));
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

  async function refine() {
    setRefining(true);
    setError(null);
    const response = await fetch("/api/ai/refine-task", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, definitionOfDone: definition }),
    });
    if (!response.ok) setError(await readError(response));
    else {
      const result = (await response.json()) as {
        suggestion: {
          title: string;
          definitionOfDone: string;
          whyThisIsTighter: string;
        };
      };
      setTitle(result.suggestion.title);
      setDefinition(result.suggestion.definitionOfDone);
      toast.add({
        title: "The model tightened the promise.",
        description: result.suggestion.whyThisIsTighter,
        type: "info",
      });
    }
    setRefining(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={task ? "outline" : "default"}
            size={task ? "sm" : "default"}
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {task ? "Renegotiate before the deadline" : "Make a real promise"}
          </DialogTitle>
          <DialogDescription>
            Specific enough that your friends can verify it from a photo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
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
              />
              <FieldDescription>
                “Study math” is not evidence. Name the finish line.
              </FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`day-${task?.id ?? "new"}`}>
                  Day
                </FieldLabel>
                <Input
                  id={`day-${task?.id ?? "new"}`}
                  name="day"
                  type="date"
                  defaultValue={task?.day ?? day}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`due-${task?.id ?? "new"}`}>
                  Due time
                </FieldLabel>
                <Input
                  id={`due-${task?.id ?? "new"}`}
                  name="dueTime"
                  type="time"
                  defaultValue={dueTime}
                  required
                />
              </Field>
            </div>
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
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={refine}
              disabled={refining || !title}
            >
              {refining ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              Tighten with AI
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {task ? "Save revision" : "Lock it in"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProofDialog({ task }: { task: Task }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    router.refresh();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Camera data-icon="inline-start" />
        {task.proof?.reviewStatus === "CHALLENGED"
          ? "Replace proof"
          : "Upload proof"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Photo receipt for “{task.title}”</DialogTitle>
          <DialogDescription>
            Metadata gets stripped. The sanitized photo is visible only to this
            squad.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`proof-${task.id}`}>Proof photo</FieldLabel>
              <Input
                id={`proof-${task.id}`}
                name="image"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/heic"
                required
              />
              <FieldDescription>
                PNG, JPEG, WebP, or HEIC. Maximum 6 MB.
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
              />
            </Field>
          </FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Upload failed.</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Camera data-icon="inline-start" />
              )}
              {pending ? "Sanitizing and reading…" : "Post proof"}
            </Button>
          </DialogFooter>
        </form>
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
        <CardTitle>Quick check-in</CardTitle>
        <CardDescription>
          Tell the squad where the day actually stands.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="responsive">
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
            >
              <ToggleGroupItem value="WORKING">Working</ToggleGroupItem>
              <ToggleGroupItem value="CLEAR">Clear</ToggleGroupItem>
              <ToggleGroupItem value="AT_RISK">At risk</ToggleGroupItem>
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
            />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter>
        <Button
          disabled={pending}
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
  return (
    <>
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <Badge variant="secondary">Phoenix · {day}</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            Three promises. Then go play.
          </h1>
          <p className="text-muted-foreground">
            Put down the schoolwork that earns your free time.
          </p>
        </div>
        {tasks.length < 3 && <TaskDialog day={day} />}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Today’s board</CardTitle>
          <CardDescription>
            {tasks.length}/3 tasks set · {verified} verified
          </CardDescription>
          <CardAction>
            <Badge>{Math.round((verified / 3) * 100)}%</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Progress
            value={(verified / 3) * 100}
            aria-label={`${verified} of 3 tasks verified`}
          />
          <ItemGroup>
            {tasks.map((task) => (
              <Item key={task.id} variant="outline">
                <ItemMedia variant="icon">
                  {task.status === "VERIFIED" ? (
                    <CheckCircle2 />
                  ) : (
                    <CalendarClock />
                  )}
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {task.title} {statusBadge(task.status)}{" "}
                    {task.proof?.isLate && (
                      <Badge variant="destructive">Late proof</Badge>
                    )}
                  </ItemTitle>
                  <ItemDescription>{task.definitionOfDone}</ItemDescription>
                  <ItemDescription>
                    Due{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      timeZone: "America/Phoenix",
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(task.dueAt))}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
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
            <Alert>
              <Bot />
              <AlertTitle>No promises yet.</AlertTitle>
              <AlertDescription>
                A blank board does not count as being “flexible.” Add the work.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      <CheckInCard initial={checkIn} />
    </>
  );
}
