"use client";

import { CalendarRange, Download, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { parseTimeblockDraft } from "@/lib/timeblock-draft";

type TimeblockStatus =
  | "OPEN"
  | "AWAITING_REVIEW"
  | "VERIFIED"
  | "MISSED"
  | "RENEGOTIATED";

export type TimeblockBuilderRow = {
  id: string;
  title: string;
  startedAt: string;
  completedAt: string;
  status: TimeblockStatus | null;
  included: boolean;
};

function statusBadge(status: TimeblockStatus | null) {
  if (!status) return <Badge variant="outline">Manual</Badge>;
  if (status === "VERIFIED") return <Badge>Verified</Badge>;
  if (status === "AWAITING_REVIEW") {
    return <Badge variant="secondary">Reviewing</Badge>;
  }
  if (status === "MISSED") {
    return <Badge variant="destructive">Late proof</Badge>;
  }
  return <Badge variant="outline">Proof added</Badge>;
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
}: {
  dueMonday: string;
  draftKey: string;
  weekEnd: string;
  initialRows: TimeblockBuilderRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const restored = useRef(false);
  const [ready, setReady] = useState(false);
  const [savedLocally, setSavedLocally] = useState(true);
  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      try {
        const draft = parseTimeblockDraft(localStorage.getItem(draftKey));
        if (draft) {
          const known = new Set(draft.map((row) => row.id));
          setRows(
            [
              ...draft.map((row) => ({
                ...row,
                status:
                  initialRows.find((fresh) => fresh.id === row.id)?.status ??
                  row.status,
              })),
              ...initialRows.filter((row) => !known.has(row.id)),
            ].slice(0, 56),
          );
        }
      } catch {
        setSavedLocally(false);
      }
      setReady(true);
    } else {
      setRows((current) => {
        const known = new Set(current.map((row) => row.id));
        const additions = initialRows.filter((row) => !known.has(row.id));
        return [
          ...current.map((row) => ({
            ...row,
            status:
              initialRows.find((fresh) => fresh.id === row.id)?.status ??
              row.status,
          })),
          ...additions,
        ].slice(0, 56);
      });
    }
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const includedCount = useMemo(
    () => rows.filter((row) => row.included && row.title.trim()).length,
    [rows],
  );
  const rowNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    const included = rows
      .filter((row) => row.included && row.title.trim())
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    included.forEach((row, index) => {
      numbers.set(row.id, index + 1);
    });
    return numbers;
  }, [rows]);

  function updateRow(id: string, patch: Partial<TimeblockBuilderRow>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    if (rows.length >= 56) return;
    setRows((current) => [
      ...current,
      {
        id: `manual-${crypto.randomUUID()}`,
        title: "",
        startedAt: `${weekEnd}T16:30`,
        completedAt: `${weekEnd}T17:00`,
        status: null,
        included: true,
      },
    ]);
  }

  async function downloadPdf() {
    if (pending) return;
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
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        .map(({ id, title, startedAt, completedAt }) => ({
          id,
          title: title.trim(),
          startedAt,
          completedAt,
        }));
      const response = await fetch("/api/timeblocks/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dueMonday, tasks }),
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
      toast.add({ title: "Two-page PDF ready.", type: "success" });
      setPending(false);
    } catch {
      setError("Could not reach the server. Check your wifi and try again.");
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Build the sheet</CardTitle>
        <CardDescription>
          Proof-backed tasks are already here. Fix the wording or times, remove
          anything irrelevant, and add work completed outside the app. Edits
          here change the report, never your original tasks or proof.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarRange />
              </EmptyMedia>
              <EmptyTitle>No completed tasks found</EmptyTitle>
              <EmptyDescription>
                Add a task manually, or upload proof during the selected week.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus data-icon="inline-start" />
                Add task
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <Card key={row.id} size="sm">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Checkbox
                      id={`include-${row.id}`}
                      checked={row.included}
                      onCheckedChange={(included) =>
                        updateRow(row.id, { included })
                      }
                    />
                    <FieldLabel htmlFor={`include-${row.id}`}>
                      Include task {index + 1}
                    </FieldLabel>
                    <Badge variant="secondary">
                      #{rowNumbers.get(row.id) ?? "–"}
                    </Badge>
                    {statusBadge(row.status)}
                    {row.status === null ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${row.title || "manual task"}`}
                        onClick={() =>
                          setRows((current) =>
                            current.filter((item) => item.id !== row.id),
                          )
                        }
                        className="ml-auto"
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  <FieldGroup className="gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_14rem_14rem]">
                    <Field>
                      <FieldLabel htmlFor={`name-${row.id}`}>
                        Task {index + 1} name
                      </FieldLabel>
                      <Input
                        id={`name-${row.id}`}
                        value={row.title}
                        onChange={(event) =>
                          updateRow(row.id, { title: event.target.value })
                        }
                        maxLength={160}
                        placeholder="Reading log"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`start-${row.id}`}>
                        Started · Phoenix
                      </FieldLabel>
                      <Input
                        id={`start-${row.id}`}
                        type="datetime-local"
                        value={row.startedAt}
                        onChange={(event) =>
                          updateRow(row.id, { startedAt: event.target.value })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`end-${row.id}`}>
                        Finished · Phoenix
                      </FieldLabel>
                      <Input
                        id={`end-${row.id}`}
                        type="datetime-local"
                        value={row.completedAt}
                        onChange={(event) =>
                          updateRow(row.id, { completedAt: event.target.value })
                        }
                      />
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {rows.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={rows.length >= 56}
            className="self-start"
          >
            <Plus data-icon="inline-start" />
            Add task
          </Button>
        ) : null}
        <Alert>
          <CalendarRange />
          <AlertTitle>What the PDF contains</AlertTitle>
          <AlertDescription>
            Page 1 is the numbered task list. Page 2 is a full 12 AM-to-12 AM
            grid for Monday through Sunday. Print landscape, double-sided, and
            flip on the long edge.
          </AlertDescription>
        </Alert>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>PDF not generated</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {includedCount}/56 tasks on the report.{" "}
          {savedLocally
            ? "Draft saved on this device."
            : "Draft stays in this tab; device storage is unavailable."}
        </p>
        <Button onClick={downloadPdf} disabled={pending}>
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Download data-icon="inline-start" />
          )}
          {pending ? "Building PDF…" : "Download print-ready PDF"}
        </Button>
      </CardFooter>
    </Card>
  );
}
