"use client";

import { Check, ChevronDown, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  UploadStatus,
  useUploadStatus,
} from "@/components/media/upload-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { holdAppRefresh, requestAppRefresh } from "@/lib/app-refresh";
import { uploadMedia } from "@/lib/media-upload";
import { formatScreenTime, screenTimeWeekLabel } from "@/lib/screen-time";

export function ScreenTimeUpload({
  weekStart,
  userId,
  circleId,
  submittedAverage,
}: {
  weekStart: string;
  userId: string;
  circleId: string;
  submittedAverage: number | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadedId = useRef<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusCheck, setStatusCheck] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus, uploadPercent] = useUploadStatus();
  const [error, setError] = useState<string | null>(null);
  const [savedAverage, setSavedAverage] = useState<number | null>(null);
  const average = savedAverage ?? submittedAverage;
  const storageKey = `screen-time-read:${userId}:${circleId}:${weekStart}`;

  useEffect(() => {
    try {
      setRunId(localStorage.getItem(storageKey));
    } catch {}
  }, [storageKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: The explicit Check status action starts one new request.
  useEffect(() => {
    if (!runId) return;
    const activeRunId = runId;
    let disposed = false;
    const controller = new AbortController();
    setCheckingStatus(true);
    async function checkStatus() {
      try {
        const response = await fetch(
          `/api/screen-time/read?runId=${encodeURIComponent(activeRunId)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const result = await response.json();
        if (disposed) return;
        if (
          (response.ok && result.pending) ||
          response.status >= 500 ||
          response.status === 429
        ) {
          return;
        }
        if (response.ok && result.reading) {
          setSavedAverage(result.reading.dailyAverageMinutes);
          setFile(null);
          if (inputRef.current) inputRef.current.value = "";
          uploadedId.current = null;
          requestAppRefresh();
        } else {
          setError(
            result.error ?? "Could not read this screenshot. Try again.",
          );
        }
        try {
          localStorage.removeItem(storageKey);
        } catch {}
        setRunId(null);
      } catch {
        // Preserve the run so returning or checking manually can retry.
      } finally {
        if (!disposed) setCheckingStatus(false);
      }
    }
    void checkStatus();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [runId, storageKey, statusCheck]);

  const busy = pending || runId !== null;

  async function read() {
    if (!file || busy) return;
    setPending(true);
    setError(null);
    const release = holdAppRefresh();
    try {
      const mediaId =
        uploadedId.current ?? (await uploadMedia([file], setStatus))[0];
      uploadedId.current = mediaId;
      setStatus("Reading screen time… This can take a minute.");
      const response = await fetch("/api/screen-time/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId, weekStart, circleId }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not read this screenshot.");
      if (result.runId) {
        try {
          localStorage.setItem(storageKey, result.runId);
        } catch {}
        setRunId(result.runId);
      } else {
        setSavedAverage(result.reading.dailyAverageMinutes);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        uploadedId.current = null;
        requestAppRefresh();
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Upload failed. Try again.",
      );
    } finally {
      setPending(false);
      setStatus("");
      release();
    }
  }

  return (
    <Card id="upload">
      <CardHeader>
        <CardTitle>
          {average === null
            ? "Upload the completed week"
            : "Your week is submitted"}
        </CardTitle>
        <CardDescription>
          Entry for {screenTimeWeekLabel(weekStart)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {average !== null && (
          <Alert>
            <Check />
            <AlertTitle>
              {formatScreenTime(average)} per day submitted
            </AlertTitle>
            <AlertDescription>
              You can replace it below. Your current entry stays until a new
              screenshot passes validation.
            </AlertDescription>
          </Alert>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void read();
          }}
          className="flex flex-col gap-3"
        >
          <FieldGroup>
            <Field data-invalid={Boolean(error)} data-disabled={busy}>
              <FieldLabel htmlFor="screen-time-image">
                Weekly screenshot
              </FieldLabel>
              <Input
                ref={inputRef}
                id="screen-time-image"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                disabled={busy}
                aria-invalid={Boolean(error)}
                aria-describedby="screen-time-file-help"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  uploadedId.current = null;
                  setError(null);
                }}
              />
              <FieldDescription id="screen-time-file-help">
                Use “Last Week’s Average” from iPhone Screen Time. PNG, JPEG,
                WebP, or HEIC, up to 100 MB.
              </FieldDescription>
              <FieldDescription>
                Valid screenshots post automatically to the leaderboard and your
                timeline. Keep this page open until background reading starts.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={!file || busy} className="self-start">
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Upload data-icon="inline-start" />
            )}
            {busy ? "Reading screenshot…" : "Upload and post"}
          </Button>
        </form>
        <Collapsible>
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                className="w-full justify-between whitespace-normal text-left"
              />
            }
          >
            How to get the right screenshot
            <ChevronDown data-icon="inline-end" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-col gap-3 pt-3 text-sm">
              <ol className="ml-5 list-decimal leading-relaxed text-muted-foreground">
                <li>
                  Open Settings → Screen Time → See All App &amp; Website
                  Activity.
                </li>
                <li>Choose Week, then go back one week from This Week.</li>
                <li>
                  Screenshot “Last Week’s Average”. No calendar dates are
                  needed.
                </li>
              </ol>
              <p className="text-muted-foreground">
                Use the same phone each week. Reminders arrive Sunday at 10 AM
                Tucson time. You can submit during the following week. Your
                accepted screenshot and numbers are visible to this circle.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
        {status && <UploadStatus status={status} percent={uploadPercent} />}
        {status && uploadPercent === null && (
          <output className="text-sm text-muted-foreground">
            {status} Keep this page open until background reading starts.
          </output>
        )}
        {runId && (
          <Alert>
            <AlertTitle>Reading in the background</AlertTitle>
            <AlertDescription>
              You can leave this page. Valid screenshots post automatically.
              Return here or check the status to see the result.
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={checkingStatus}
                onClick={() => setStatusCheck((value) => value + 1)}
              >
                {checkingStatus ? "Checking…" : "Check status"}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not finish</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
