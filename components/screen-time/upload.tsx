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
import { waitForScreenTimeRead } from "@/lib/screen-time-read-client";

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
  const [reconnecting, setReconnecting] = useState(false);
  const [takingLonger, setTakingLonger] = useState(false);
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

  useEffect(() => {
    if (!runId) return;
    let disposed = false;
    const controller = new AbortController();
    setReconnecting(false);
    setTakingLonger(false);
    const slowTimer = setTimeout(() => setTakingLonger(true), 60000);
    void waitForScreenTimeRead(runId, controller.signal, (value) => {
      if (!disposed) setReconnecting(value);
    })
      .then((result) => {
        if (disposed) return;
        if ("reading" in result) {
          setSavedAverage(result.reading.dailyAverageMinutes);
          setFile(null);
          if (inputRef.current) inputRef.current.value = "";
          uploadedId.current = null;
          requestAppRefresh();
        } else {
          setError(result.error);
        }
        try {
          localStorage.removeItem(storageKey);
        } catch {}
        setRunId(null);
      })
      .catch(() => {
        // Unmounting stops observation only. The saved read resumes on return.
      });
    return () => {
      disposed = true;
      clearTimeout(slowTimer);
      controller.abort();
    };
  }, [runId, storageKey]);

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
      setStatus("Starting screenshot read…");
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
                timeline once checked.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={!file || busy} className="self-start">
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Upload data-icon="inline-start" />
            )}
            {runId
              ? "Reading screenshot…"
              : pending
                ? "Uploading…"
                : "Upload and post"}
          </Button>
          <div aria-live="polite" aria-atomic="true">
            {status && !runId && (
              <UploadStatus status={status} percent={uploadPercent} />
            )}
            {runId && (
              <p className="text-sm text-muted-foreground">
                {reconnecting
                  ? "Connection interrupted. Reconnecting automatically."
                  : takingLonger
                    ? "This is taking longer than usual. Your screenshot is saved, and the result will appear here automatically."
                    : "Checking your weekly average. Your result will appear here automatically."}
              </p>
            )}
          </div>
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
