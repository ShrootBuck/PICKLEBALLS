"use client";

import { CalendarRange, Download, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

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
  weekEnd,
  initialRows,
}: {
  dueMonday: string;
  weekEnd: string;
  initialRows: TimeblockBuilderRow[];
}) {
  const [rows, setRows] = useState(initialRows);
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
      URL.revokeObjectURL(url);
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
          here apply to this download only.
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
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Use</TableHead>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="min-w-64">Task</TableHead>
                  <TableHead className="min-w-48">Started</TableHead>
                  <TableHead className="min-w-48">Finished</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow
                    key={row.id}
                    data-state={row.included ? undefined : "selected"}
                  >
                    <TableCell>
                      <Checkbox
                        aria-label={`Include ${row.title || `task ${index + 1}`}`}
                        checked={row.included}
                        onCheckedChange={(checked) =>
                          updateRow(row.id, { included: checked })
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {rowNumbers.get(row.id) ?? "-"}
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Task ${index + 1} name`}
                        value={row.title}
                        onChange={(event) =>
                          updateRow(row.id, { title: event.target.value })
                        }
                        maxLength={160}
                        placeholder="Reading log"
                        className="min-w-64"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`${row.title || `Task ${index + 1}`} start time`}
                        type="datetime-local"
                        value={row.startedAt}
                        onChange={(event) =>
                          updateRow(row.id, { startedAt: event.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`${row.title || `Task ${index + 1}`} finish time`}
                        type="datetime-local"
                        value={row.completedAt}
                        onChange={(event) =>
                          updateRow(row.id, {
                            completedAt: event.target.value,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>{statusBadge(row.status)}</TableCell>
                    <TableCell>
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
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {rows.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={addRow}
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
          {includedCount} {includedCount === 1 ? "task" : "tasks"} on the report
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
