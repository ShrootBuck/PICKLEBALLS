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
      <Card size="sm">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <CardTitle id={`${formId}-mood-label`}>
              How are you feeling?
            </CardTitle>
            <CardDescription className="text-xs">
              Shared with your circle
            </CardDescription>
          </div>
          <ToggleGroup
            aria-labelledby={`${formId}-mood-label`}
            spacing={1}
            value={mood === null ? [] : [String(mood)]}
            disabled={pending}
            className="mood-scale w-full"
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
                className="h-auto flex-1 flex-col gap-1.5 rounded-lg border border-transparent px-0 py-2.5 text-muted-foreground aria-pressed:border-primary/40 aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:shadow-none aria-pressed:hover:bg-accent aria-pressed:hover:text-accent-foreground"
              >
                <span aria-hidden="true" className="text-[22px] leading-none">
                  {item.face}
                </span>
                <span className="text-center text-[11px] leading-tight sm:text-xs">
                  {item.label}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardHeader>
        {selected && (
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel id={`${formId}-feelings-label`}>
                  What words fit? (optional)
                </FieldLabel>
                <ToggleGroup
                  multiple
                  aria-labelledby={`${formId}-feelings-label`}
                  variant="outline"
                  size="sm"
                  value={feelings}
                  onValueChange={setFeelings}
                  disabled={pending}
                  className="flex-wrap gap-1.5"
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
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Could not share</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </CardContent>
        )}
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
