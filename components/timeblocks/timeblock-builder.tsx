"use client";

import {
  CalendarRange,
  Check,
  Clock3,
  Download,
  List,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  blockTime,
  TimeblockCalendar,
} from "@/components/timeblocks/timeblock-calendar";
import { TimeblockChat } from "@/components/timeblocks/timeblock-chat";
import { TimeblockRoutineForm } from "@/components/timeblocks/timeblock-routine-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { formatDayShort, parsePhoenixLocalDateTime } from "@/lib/time";
import { blockDuration } from "@/lib/timeblock-calendar";
import {
  compareTimeblockRows,
  MAX_TIMEBLOCKS,
  parseTimeblockDraft,
  type TimeblockDraftRow,
} from "@/lib/timeblock-draft";
import {
  blockIssue,
  draftFingerprint,
  overlappingIds,
  reportFingerprint,
} from "@/lib/timeblock-editor";
import {
  isRoutineBlock,
  routineBlocks,
  type TimeblockRoutine,
} from "@/lib/timeblock-routine";
import { shiftDateKey } from "@/lib/timeblocks";

export type TimeblockBuilderRow = TimeblockDraftRow;

function BlockEditor({
  row,
  dueMonday,
  onSave,
  onRemove,
  onClose,
  isNew,
}: {
  row: TimeblockDraftRow;
  dueMonday: string;
  onSave: (row: TimeblockDraftRow) => void;
  onRemove: () => void;
  onClose: () => void;
  isNew: boolean;
}) {
  const [draft, setDraft] = useState(row);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const next = {
              ...draft,
              title: String(values.get("title") ?? "").trim(),
              category: String(values.get("category") ?? "").trim(),
              startedAt: String(values.get("startedAt") ?? ""),
              completedAt: String(values.get("completedAt") ?? ""),
            };
            const issue = blockIssue(next, dueMonday);
            setError(issue);
            if (!issue) onSave(next);
          }}
        >
          <DialogHeader>
            <DialogTitle>{isNew ? "Add a block" : "Edit block"}</DialogTitle>
            <DialogDescription>
              {formatDayShort(shiftDateKey(dueMonday, -7))} through{" "}
              {formatDayShort(shiftDateKey(dueMonday, -1))}. All times are
              Phoenix time.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={!!error && !draft.title.trim()}>
              <FieldLabel htmlFor="block-title">What did you do?</FieldLabel>
              <Input
                id="block-title"
                name="title"
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
                placeholder="Physics problem set"
                maxLength={160}
                required
                aria-invalid={!!error && !draft.title.trim()}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="block-category">Category</FieldLabel>
              <Input
                id="block-category"
                name="category"
                value={draft.category ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, category: event.target.value })
                }
                placeholder="Physics, applications, exercise…"
                maxLength={80}
              />
            </Field>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="block-start">Started</FieldLabel>
              <Input
                id="block-start"
                name="startedAt"
                type="datetime-local"
                value={draft.startedAt}
                onChange={(event) =>
                  setDraft({ ...draft, startedAt: event.target.value })
                }
                required
                aria-invalid={!!error}
              />
            </Field>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="block-end">Finished</FieldLabel>
              <Input
                id="block-end"
                name="completedAt"
                type="datetime-local"
                value={draft.completedAt}
                onChange={(event) =>
                  setDraft({ ...draft, completedAt: event.target.value })
                }
                required
                aria-invalid={!!error}
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="block-included"
                checked={draft.included}
                onCheckedChange={(included) => setDraft({ ...draft, included })}
              />
              <FieldLabel htmlFor="block-included">Include in PDF</FieldLabel>
            </Field>
          </FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Check this block</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {blockDuration(draft.startedAt, draft.completedAt) && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock3 className="size-4" />
              {blockDuration(draft.startedAt, draft.completedAt)} total
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={isNew ? onClose : onRemove}
            >
              {!isNew && <Trash2 data-icon="inline-start" />}
              {isNew ? "Cancel" : row.status ? "Exclude" : "Remove"}
            </Button>
            <Button type="submit">
              <Check data-icon="inline-start" />
              Save block
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "Could not build the PDF.";
}

export function TimeblockBuilder({
  dueMonday,
  draftKey,
  weekEnd,
  initialRows,
  initialRoutine,
}: {
  dueMonday: string;
  draftKey: string;
  weekEnd: string;
  initialRows: TimeblockBuilderRow[];
  initialRoutine: TimeblockRoutine;
}) {
  const [routineFocus, setRoutineFocus] = useState<{ id: string } | null>(null);
  const [rows, setRows] = useState(initialRows);
  const rowsRef = useRef(initialRows);
  const [routine, setRoutine] = useState(initialRoutine);
  const routineRef = useRef(initialRoutine);
  const [routineSaveStatus, setRoutineSaveStatus] = useState<
    "saved" | "saving" | "error"
  >("saved");
  const [routineDirty, setRoutineDirty] = useState(false);
  const routineDirtyRef = useRef(false);
  const onRoutineDirtyChange = useCallback((dirty: boolean) => {
    routineDirtyRef.current = dirty;
    setRoutineDirty(dirty);
  }, []);
  const saveQueue = useRef(Promise.resolve());
  const saveVersion = useRef(0);
  const persistRoutine = useCallback((next: TimeblockRoutine) => {
    const version = ++saveVersion.current;
    setRoutineSaveStatus("saving");
    // Serialize writes so an older request cannot overwrite a later edit/undo.
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        const response = await fetch("/api/timeblocks/routine", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!response.ok) throw new Error("Settings could not save");
        if (version === saveVersion.current) setRoutineSaveStatus("saved");
      } catch {
        if (version === saveVersion.current) setRoutineSaveStatus("error");
      }
    });
  }, []);
  const history = useRef<{
    past: { rows: TimeblockDraftRow[]; routine: TimeblockRoutine }[];
    future: { rows: TimeblockDraftRow[]; routine: TimeblockRoutine }[];
  }>({ past: [], future: [] });
  const restored = useRef(false);
  const [ready, setReady] = useState(false);
  const [savedLocally, setSavedLocally] = useState(true);
  const [editing, setEditing] = useState<TimeblockDraftRow | null>(null);
  const [newBlock, setNewBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const getRows = useCallback(() => rowsRef.current, []);
  const getRoutine = useCallback(() => routineRef.current, []);
  const commit = useCallback(
    (next: TimeblockDraftRow[], nextRoutine = routineRef.current) => {
      if (
        reportFingerprint(next, nextRoutine) ===
        reportFingerprint(rowsRef.current, routineRef.current)
      )
        return;
      history.current.past = [
        ...history.current.past,
        { rows: rowsRef.current, routine: routineRef.current },
      ].slice(-40);
      history.current.future = [];
      rowsRef.current = next;
      setRows(next);
      if (JSON.stringify(nextRoutine) !== JSON.stringify(routineRef.current)) {
        routineRef.current = nextRoutine;
        setRoutine(nextRoutine);
        persistRoutine(nextRoutine);
      }
      setError(null);
    },
    [persistRoutine],
  );
  const applyEdit = useCallback(
    (
      before: string,
      next: TimeblockDraftRow[],
      nextRoutine: TimeblockRoutine,
    ) => {
      if (
        routineDirtyRef.current ||
        reportFingerprint(rowsRef.current, routineRef.current) !== before
      )
        return false;
      commit(next, nextRoutine);
      // Save rows before the chat acknowledges the tool result. Refreshing
      // between effects must not keep the receipt while losing the edit.
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({ version: 1, rows: next }),
        );
      } catch {
        setSavedLocally(false);
      }
      return true;
    },
    [commit, draftKey],
  );
  useEffect(() => {
    let current = rowsRef.current;
    if (!restored.current) {
      restored.current = true;
      try {
        current =
          parseTimeblockDraft(localStorage.getItem(draftKey)) ?? current;
      } catch {
        setSavedLocally(false);
      }
    }
    const known = new Set(current.map((row) => row.id));
    const next = [
      ...current.map((row) => ({
        ...row,
        status:
          initialRows.find((fresh) => fresh.id === row.id)?.status ??
          row.status,
      })),
      ...initialRows.filter((row) => !known.has(row.id)),
    ].slice(0, MAX_TIMEBLOCKS);
    rowsRef.current = next;
    setRows(next);
    setReady(true);
  }, [draftKey, initialRows]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ version: 1, rows }));
      setSavedLocally(true);
    } catch {
      setSavedLocally(false);
    }
  }, [rows, draftKey, ready]);

  const included = useMemo(() => rows.filter((row) => row.included), [rows]);
  const includedCount = included.length;
  const calendarRows = useMemo(
    () => [...rows, ...routineBlocks(dueMonday, routine)],
    [rows, dueMonday, routine],
  );
  const overlaps = useMemo(() => overlappingIds(calendarRows), [calendarRows]);
  const issues = included
    .map((row) => ({ row, issue: blockIssue(row, dueMonday) }))
    .filter((item) => item.issue);
  const hours = included.reduce((sum, row) => {
    const start = parsePhoenixLocalDateTime(row.startedAt);
    const end = parsePhoenixLocalDateTime(row.completedAt);
    return (
      sum +
      (start && end && end > start
        ? (end.getTime() - start.getTime()) / 3_600_000
        : 0)
    );
  }, 0);

  function undo() {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push({
      rows: rowsRef.current,
      routine: routineRef.current,
    });
    rowsRef.current = previous.rows;
    setRows(previous.rows);
    if (JSON.stringify(routineRef.current) !== JSON.stringify(previous.routine))
      persistRoutine(previous.routine);
    routineRef.current = previous.routine;
    setRoutine(previous.routine);
    setError(null);
  }
  function redo() {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push({
      rows: rowsRef.current,
      routine: routineRef.current,
    });
    rowsRef.current = next.rows;
    setRows(next.rows);
    if (JSON.stringify(routineRef.current) !== JSON.stringify(next.routine))
      persistRoutine(next.routine);
    routineRef.current = next.routine;
    setRoutine(next.routine);
    setError(null);
  }
  function openEditor(row: TimeblockDraftRow) {
    if (isRoutineBlock(row.id)) {
      setRoutineFocus({
        id: row.id.includes("custom")
          ? "custom-routine"
          : row.id.includes("school")
            ? `period-${row.id.slice(-1)}`
            : "sleep-bedtime",
      });
      return;
    }
    setNewBlock(false);
    setEditing(row);
  }
  function addRow(day = weekEnd) {
    if (rowsRef.current.length >= MAX_TIMEBLOCKS) return;
    setNewBlock(true);
    setEditing({
      id: `manual-${crypto.randomUUID()}`,
      title: "",
      startedAt: `${day}T16:00`,
      completedAt: `${day}T17:00`,
      status: null,
      included: true,
    });
  }
  function saveRow(next: TimeblockDraftRow) {
    const current = rowsRef.current.find((row) => row.id === next.id);
    if (
      (!current && !newBlock) ||
      (current &&
        editing &&
        draftFingerprint([current]) !== draftFingerprint([editing]))
    ) {
      toast.add({
        title:
          "This block changed while you were editing. Reopen it to use the latest version.",
        type: "error",
      });
      setEditing(null);
      return;
    }
    if (!current && rowsRef.current.length >= MAX_TIMEBLOCKS) {
      toast.add({
        title: `The report holds up to ${MAX_TIMEBLOCKS} blocks.`,
        type: "error",
      });
      return;
    }
    commit(
      current
        ? rowsRef.current.map((row) => (row.id === next.id ? next : row))
        : [...rowsRef.current, next],
    );
    setEditing(null);
  }
  async function downloadPdf() {
    if (!ready || pending || busy || routineDirty || issues.length > 0) return;
    if (rows.some((row) => row.included && !row.title.trim())) {
      setError(
        "Give each included task a name, or uncheck it before downloading.",
      );
      return;
    }
    setPending(true);
    setError(null);
    try {
      const tasks = rows
        .filter((row) => row.included && row.title.trim())
        .sort((a, b) => compareTimeblockRows(a, b, routine.listOrder))
        .map(({ id, title, category, startedAt, completedAt }) => ({
          id,
          title: title.trim(),
          category,
          startedAt,
          completedAt,
        }));
      const response = await fetch("/api/timeblocks/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dueMonday, tasks, routine: routineRef.current }),
      });
      if (!response.ok) {
        setError(await readError(response));
        setPending(false);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `timeblock-${dueMonday}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.add({ title: "Printable PDF ready.", type: "success" });
      setPending(false);
    } catch {
      setError("Could not reach the server. Check your wifi and try again.");
      setPending(false);
    }
  }

  return (
    <div className="timeblock-workspace">
      <div className="timeblock-studio-heading">
        <div>
          <p className="timeblock-eyebrow">WEEKLY REPORT</p>
          <h2>Make the week add up.</h2>
          <p className="text-sm text-muted-foreground">
            Add your classes and sleep. Review your work. Export and print.
          </p>
        </div>
        <div className="timeblock-stats">
          <div>
            <strong>
              {hours.toLocaleString("en-US", { maximumFractionDigits: 1 })}
              <span>h</span>
            </strong>
            <p>work logged</p>
          </div>
          <div>
            <strong>
              {includedCount}
              <span>/ {MAX_TIMEBLOCKS}</span>
            </strong>
            <p>work blocks included</p>
          </div>
        </div>
      </div>
      <TimeblockRoutineForm
        key={JSON.stringify(routine)}
        routine={routine}
        focusRequest={routineFocus}
        disabled={!ready}
        onSave={(next) => commit(rowsRef.current, next)}
        saveStatus={routineSaveStatus}
        onDirtyChange={onRoutineDirtyChange}
        onRetry={() => persistRoutine(routineRef.current)}
      />
      <div className="timeblock-studio-grid">
        <Card className="timeblock-board">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Your week at a glance</CardTitle>
                <CardDescription>
                  {formatDayShort(shiftDateKey(dueMonday, -7))} through{" "}
                  {formatDayShort(weekEnd)}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Undo last edit"
                  title={
                    routineDirty
                      ? "Apply routine changes before undoing"
                      : "Undo last edit"
                  }
                  disabled={
                    !ready || routineDirty || !history.current.past.length
                  }
                  onClick={undo}
                >
                  <Undo2 />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Redo last edit"
                  title={
                    routineDirty
                      ? "Apply routine changes before redoing"
                      : "Redo last edit"
                  }
                  disabled={
                    !ready || routineDirty || !history.current.future.length
                  }
                  onClick={redo}
                >
                  <Redo2 />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!ready || rows.length >= MAX_TIMEBLOCKS}
                  onClick={() => addRow()}
                >
                  <Plus data-icon="inline-start" />
                  Add block
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 px-0">
            <Tabs defaultValue="calendar">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4">
                <TabsList>
                  <TabsTrigger value="calendar">
                    <CalendarRange data-icon="inline-start" />
                    Calendar
                  </TabsTrigger>
                  <TabsTrigger value="list">
                    <List data-icon="inline-start" />
                    All blocks
                  </TabsTrigger>
                </TabsList>
                <p className="text-xs text-muted-foreground">
                  Click a block to edit
                </p>
              </div>
              <TabsContent value="calendar">
                <TimeblockCalendar
                  rows={calendarRows}
                  weekStart={shiftDateKey(dueMonday, -7)}
                  overlaps={overlaps}
                  onSelect={openEditor}
                  onAdd={addRow}
                  disabled={!ready}
                  addDisabled={rows.length >= MAX_TIMEBLOCKS}
                />
              </TabsContent>
              <TabsContent value="list">
                <div className="timeblock-list">
                  {calendarRows.length === 0 ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <CalendarRange />
                        </EmptyMedia>
                        <EmptyTitle>A clean slate</EmptyTitle>
                        <EmptyDescription>
                          Add a block or tell the AI editor what you worked on.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    [...calendarRows]
                      .sort((a, b) =>
                        compareTimeblockRows(a, b, routine.listOrder),
                      )
                      .map((row) => (
                        <div
                          key={row.id}
                          className="timeblock-list-row"
                          data-excluded={!row.included || undefined}
                        >
                          <Checkbox
                            checked={row.included}
                            disabled={!ready || isRoutineBlock(row.id)}
                            aria-label={`Include ${row.title || "untitled block"} in PDF`}
                            onCheckedChange={(included) =>
                              commit(
                                rowsRef.current.map((item) =>
                                  item.id === row.id
                                    ? { ...item, included }
                                    : item,
                                ),
                              )
                            }
                          />
                          <Button
                            variant="plain"
                            type="button"
                            className="timeblock-list-open"
                            disabled={!ready}
                            onClick={() => openEditor(row)}
                          >
                            <strong>{row.title || "Untitled block"}</strong>
                            {row.category && <span>{row.category}</span>}
                            <span>
                              {formatDayShort(row.startedAt.slice(0, 10))} ·{" "}
                              {blockTime(row.startedAt)} to{" "}
                              {row.startedAt.slice(0, 10) !==
                                row.completedAt.slice(0, 10) &&
                                `${formatDayShort(row.completedAt.slice(0, 10))} `}
                              {blockTime(row.completedAt)}
                              {blockDuration(row.startedAt, row.completedAt) &&
                                ` · ${blockDuration(row.startedAt, row.completedAt)}`}
                            </span>
                          </Button>
                          <Badge
                            variant={
                              overlaps.has(row.id) ? "destructive" : "outline"
                            }
                          >
                            {overlaps.has(row.id)
                              ? "Overlap"
                              : !row.included
                                ? "Excluded"
                                : isRoutineBlock(row.id)
                                  ? "Routine"
                                  : row.status === "VERIFIED"
                                    ? "Verified proof"
                                    : row.status
                                      ? "From proof"
                                      : "Manual"}
                          </Badge>
                        </div>
                      ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
            {issues.length > 0 && (
              <Alert variant="destructive" className="mx-4 w-auto">
                <AlertTitle>
                  {issues.length}{" "}
                  {issues.length === 1 ? "block needs" : "blocks need"}{" "}
                  attention
                </AlertTitle>
                <AlertDescription>
                  {issues[0].row.title || "Untitled block"}: {issues[0].issue}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditor(issues[0].row)}
                  >
                    Fix block
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {rows.length >= MAX_TIMEBLOCKS && (
              <Alert className="mx-4 w-auto">
                <AlertTitle>
                  All {MAX_TIMEBLOCKS} work blocks are in use
                </AlertTitle>
                <AlertDescription>
                  Remove a manual block to make room. Excluded blocks still
                  count toward the limit.
                </AlertDescription>
              </Alert>
            )}
            {overlaps.size > 0 && (
              <Alert className="mx-4 w-auto">
                <Clock3 />
                <AlertTitle>{overlaps.size} blocks overlap</AlertTitle>
                <AlertDescription>
                  Check the highlighted blocks or ask the AI editor to review
                  them. Overlaps can still be exported.
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" className="mx-4 w-auto">
                <AlertTitle>PDF not generated</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="timeblock-legend-dot" />
              From proof
              <span className="timeblock-legend-dot" data-manual />
              Manual
              <span className="timeblock-legend-dot" data-routine />
              School & sleep
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {!ready
                ? "Restoring draft…"
                : savedLocally
                  ? "Draft saved on this device"
                  : "Device storage unavailable. Keep this tab open."}
            </p>
          </CardFooter>
        </Card>
        <TimeblockChat
          draftKey={draftKey}
          dueMonday={dueMonday}
          getRows={getRows}
          getRoutine={getRoutine}
          applyEdit={applyEdit}
          onBusyChange={setBusy}
          ready={ready}
        />
      </div>
      <div className="timeblock-export-bar">
        <div>
          <p className="font-medium">Ready to hand in</p>
          <p
            id="timeblock-export-status"
            className="text-xs text-muted-foreground"
            aria-live="polite"
          >
            {routineDirty
              ? "Apply your school and sleep changes before exporting."
              : issues.length
                ? "Fix the flagged blocks before exporting."
                : busy
                  ? "Wait for the AI editor to finish before exporting."
                  : "Landscape PDF with school, sleep, and your work. Extra pages are added as needed."}
          </p>
        </div>
        <Button
          onClick={downloadPdf}
          aria-describedby="timeblock-export-status"
          disabled={
            !ready || pending || busy || routineDirty || issues.length > 0
          }
        >
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Download data-icon="inline-start" />
          )}
          {pending
            ? "Building PDF…"
            : routineDirty
              ? "Apply school & sleep first"
              : "Export PDF"}
        </Button>
      </div>
      {editing && (
        <BlockEditor
          key={editing.id}
          row={editing}
          isNew={newBlock}
          dueMonday={dueMonday}
          onClose={() => setEditing(null)}
          onSave={saveRow}
          onRemove={() => {
            const current = rowsRef.current.find(
              (row) => row.id === editing.id,
            );
            commit(
              current?.status
                ? rowsRef.current.map((row) =>
                    row.id === editing.id ? { ...row, included: false } : row,
                  )
                : rowsRef.current.filter((row) => row.id !== editing.id),
            );
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
