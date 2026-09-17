"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { MediaPicker } from "@/components/media/media-picker";
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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { appFetch } from "@/lib/app-refresh";
import { uploadMedia } from "@/lib/media-upload";
import { moodDetails, moods } from "@/lib/mood";

export function MoodCheckIn({
  onShared,
  onPendingChange,
}: {
  onShared?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const formId = useId();
  const [mood, setMood] = useState<number | null>(null);
  const [feelings, setFeelings] = useState<string[]>([]);
  const [journal, setJournal] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const [files, setFiles] = useState<File[]>([]);
  const uploadedIds = useRef<string[] | null>(null);
  const [uploadStatus, setUploadStatus, uploadPercent] = useUploadStatus();
  const selected = mood === null ? null : moodDetails(mood);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mood === null || saving.current) return;
    saving.current = true;
    setPending(true);
    onPendingChange?.(true);
    setError(null);
    try {
      const mediaIds =
        uploadedIds.current ??
        (files.length ? await uploadMedia(files, setUploadStatus) : []);
      uploadedIds.current = mediaIds;
      const response = await appFetch("/api/mood", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mood, feelings, journal, mediaIds }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not post your check-in.");
      setFiles([]);
      uploadedIds.current = null;
      setMood(null);
      setFeelings([]);
      setJournal("");
      toast.add({ title: "Mood shared with your circle", type: "success" });
      onShared?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not connect. Your draft is still here.",
      );
    } finally {
      setUploadStatus("");
      saving.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  }

  return (
    <form onSubmit={submit} aria-busy={pending}>
      <Card>
        <CardHeader>
          <CardTitle>How are you feeling?</CardTitle>
          <CardDescription>Shared with your circle.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel id={`${formId}-mood-label`}>
                Right now, I feel…
              </FieldLabel>
              <ToggleGroup
                aria-labelledby={`${formId}-mood-label`}
                variant="outline"
                value={mood === null ? [] : [String(mood)]}
                disabled={pending}
                className="w-full flex-wrap"
                onValueChange={(values) => {
                  const next = values[0] ? Number(values[0]) : null;
                  setMood(next);
                  const allowed: readonly string[] =
                    next === null ? [] : (moodDetails(next)?.feelings ?? []);
                  setFeelings((current) =>
                    current.filter((feeling) => allowed.includes(feeling)),
                  );
                }}
              >
                {moods.map((item) => (
                  <ToggleGroupItem
                    key={item.value}
                    value={String(item.value)}
                    className="h-24 flex-1 flex-col gap-1 px-1 py-3 sm:h-20 sm:px-2.5"
                  >
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-2xl leading-none"
                    >
                      {item.face}
                    </span>
                    <span className="h-[2lh] shrink-0 whitespace-normal text-center text-xs leading-tight sm:h-[1lh] sm:text-sm">
                      {item.label}
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            {selected && (
              <>
                <Field>
                  <FieldLabel id={`${formId}-feelings-label`}>
                    What words fit? (optional)
                  </FieldLabel>
                  <ToggleGroup
                    multiple
                    aria-labelledby={`${formId}-feelings-label`}
                    variant="outline"
                    value={feelings}
                    onValueChange={setFeelings}
                    disabled={pending}
                    className="flex-wrap"
                  >
                    {selected.feelings.map((feeling) => (
                      <ToggleGroupItem key={feeling} value={feeling}>
                        {feeling}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-journal`}>
                    Want to write about it?
                  </FieldLabel>
                  <Textarea
                    id={`${formId}-journal`}
                    placeholder="What's on your mind?"
                    value={journal}
                    onChange={(event) => setJournal(event.target.value)}
                    maxLength={5000}
                    rows={4}
                    disabled={pending}
                    aria-describedby={`${formId}-journal-help`}
                  />
                  <FieldDescription id={`${formId}-journal-help`}>
                    {journal.length.toLocaleString()}/5,000
                  </FieldDescription>
                </Field>
                <MediaPicker
                  files={files}
                  disabled={pending}
                  onChange={(next) => {
                    setFiles(next);
                    uploadedIds.current = null;
                  }}
                />
                <UploadStatus status={uploadStatus} percent={uploadPercent} />
              </>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Could not share</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </CardContent>
        {selected && (
          <CardFooter>
            <Button type="submit" disabled={pending} className="w-full">
              {pending && <Spinner data-icon="inline-start" />}Share check-in
            </Button>
          </CardFooter>
        )}
      </Card>
    </form>
  );
}
