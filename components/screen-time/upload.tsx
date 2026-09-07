"use client";

import { Check, Smartphone, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { MediaGallery } from "@/components/media/media-gallery";
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { appFetch, holdAppRefresh } from "@/lib/app-refresh";
import { uploadMedia } from "@/lib/media-upload";
import { formatScreenTime, screenTimeWeekLabel } from "@/lib/screen-time";

type Reading = {
  id: string;
  mediaId: string;
  weekStart: string;
  dailyAverageMinutes: number;
  totalMinutes: number | null;
};

export function ScreenTimeUpload({
  weekStart,
  circleId,
  submittedAverage,
}: {
  weekStart: string;
  circleId: string;
  submittedAverage: number | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const uploadedId = useRef<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedAverage, setSavedAverage] = useState<number | null>(null);
  const average = savedAverage ?? submittedAverage;

  async function read() {
    if (!file || pending) return;
    setPending(true);
    setError(null);
    const release = holdAppRefresh();
    try {
      const mediaId =
        uploadedId.current ?? (await uploadMedia([file], setStatus))[0];
      uploadedId.current = mediaId;
      setStatus("Reading dates and screen time… This can take a minute.");
      const response = await fetch("/api/screen-time/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId, weekStart, circleId }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not read this screenshot.");
      setReading(result.reading);
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

  async function confirm() {
    if (!reading || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await appFetch("/api/screen-time", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ readingId: reading.id, circleId }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not save your screen time.");
      setSavedAverage(reading.dailyAverageMinutes);
      setReading(null);
      setFile(null);
      uploadedId.current = null;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save. Try again.",
      );
    } finally {
      setPending(false);
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
          {screenTimeWeekLabel(weekStart)} · iPhone only
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
              You can replace it below. Your current entry stays until you
              confirm the replacement.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium">Get the right screenshot</p>
          <ol className="ml-5 list-decimal leading-relaxed text-muted-foreground">
            <li>
              Open Settings → Screen Time → See All App &amp; Website Activity.
            </li>
            <li>
              Under Devices, select your iPhone. Use the same phone each week.
            </li>
            <li>
              Choose Week, then use the back arrow by the dates to go back one
              week. “This Week” is still in progress.
            </li>
            <li>
              Check the dates match {screenTimeWeekLabel(weekStart)}. Screenshot
              the date range, device name, and Daily Average.
            </li>
          </ol>
          <p className="text-muted-foreground">
            Reminders arrive Sunday at 10 AM Tucson time. You can submit during
            the following week. Your confirmed screenshot and numbers are
            visible to this circle.
          </p>
        </div>
        {reading ? (
          <div className="flex flex-col gap-4">
            <Alert>
              <Smartphone />
              <AlertTitle>Check the read before posting</AlertTitle>
              <AlertDescription>
                AI can misread numbers. Compare these with your screenshot; if
                they are wrong, choose a clearer image.
              </AlertDescription>
            </Alert>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-muted-foreground">Dates</dt>
              <dd>{screenTimeWeekLabel(reading.weekStart)}</dd>
              <dt className="text-muted-foreground">Daily average</dt>
              <dd className="font-medium tabular-nums">
                {formatScreenTime(reading.dailyAverageMinutes)}
              </dd>
              {reading.totalMinutes !== null && (
                <>
                  <dt className="text-muted-foreground">Weekly total</dt>
                  <dd className="tabular-nums">
                    {formatScreenTime(reading.totalMinutes)}
                  </dd>
                </>
              )}
            </dl>
            <MediaGallery ids={[reading.mediaId]} />
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending} onClick={confirm}>
                {pending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Check data-icon="inline-start" />
                )}
                Confirm and post
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setReading(null);
                  setFile(null);
                  uploadedId.current = null;
                  setError(null);
                }}
              >
                Choose another screenshot
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void read();
            }}
            className="flex flex-col gap-3"
          >
            <FieldGroup>
              <Field data-invalid={Boolean(error)} data-disabled={pending}>
                <FieldLabel htmlFor="screen-time-image">
                  Weekly screenshot
                </FieldLabel>
                <Input
                  key={average}
                  id="screen-time-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                  disabled={pending}
                  aria-invalid={Boolean(error)}
                  aria-describedby="screen-time-file-help"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    uploadedId.current = null;
                    setError(null);
                  }}
                />
                <FieldDescription id="screen-time-file-help">
                  One PNG, JPEG, WebP, or HEIC, up to 100 MB. A screenshot is
                  usually clearest.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <Button
              type="submit"
              disabled={!file || pending}
              className="self-start"
            >
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Upload data-icon="inline-start" />
              )}
              {pending ? "Reading screenshot…" : "Read screenshot"}
            </Button>
          </form>
        )}
        {status && (
          <output className="text-sm text-muted-foreground">{status}</output>
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
