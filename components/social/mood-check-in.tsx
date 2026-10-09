"use client";

import { ArrowLeft, ArrowRight, ImagePlus, Shuffle, X } from "lucide-react";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MediaPicker } from "@/components/media/media-picker";
import {
  UploadStatus,
  useUploadStatus,
} from "@/components/media/upload-status";
import {
  FeelingPicker,
  type FeelingPickerState,
  newFeelingPickerState,
} from "@/components/mood/feeling-picker";
import { ImpactIcon, ImpactList } from "@/components/mood/mood-display";
import { MoodShape } from "@/components/mood/mood-shape";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import { appFetch } from "@/lib/app-refresh";
import { browseFeelings, feelingPageSize } from "@/lib/feelings";
import { uploadMedia } from "@/lib/media-upload";
import {
  formatFeelings,
  impacts,
  journalPrompts,
  moodGradient,
  moodLevel,
  moodLevelLabel,
  moodStyle,
  suggestedImpacts,
} from "@/lib/mood";

type Step = 0 | 1 | 2 | 3;
type Draft = {
  step: Step;
  valence: number;
  feelings: string[];
  impacts: string[];
  wordPicker: FeelingPickerState;
  journal: string;
  promptIndex: number;
  files: File[];
  uploadedIds: string[] | null;
};

// Survives closing the sheet, like the task and proof composer drafts.
let savedDraft: Draft | null = null;

const steps: Step[] = [0, 1, 2, 3];
const stepCount = steps.length;

export function MoodCheckInSheet({ onClose }: { onClose: () => void }) {
  const [initial] = useState(() => savedDraft);
  const [step, setStep] = useState<Step>(initial?.step ?? 0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [valence, setValence] = useState(initial?.valence ?? 0);
  const [chosen, setChosen] = useState<string[]>(initial?.feelings ?? []);
  const [chosenImpacts, setChosenImpacts] = useState<string[]>(
    initial?.impacts ?? [],
  );
  const [wordPicker, setWordPicker] = useState(
    initial?.wordPicker ?? newFeelingPickerState(),
  );
  const [journal, setJournal] = useState(initial?.journal ?? "");
  const [promptIndex, setPromptIndex] = useState(initial?.promptIndex ?? 0);
  const [files, setFiles] = useState<File[]>(initial?.files ?? []);
  const [showMedia, setShowMedia] = useState(false);
  const uploadedIds = useRef<string[] | null>(initial?.uploadedIds ?? null);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus, uploadPercent] = useUploadStatus();
  const shared = useRef(false);

  useEffect(() => {
    return () => {
      if (shared.current) return;
      const started = step > 0 || journal.trim() || files.length;
      savedDraft = started
        ? {
            step,
            valence,
            feelings: chosen,
            impacts: chosenImpacts,
            wordPicker,
            journal,
            promptIndex,
            files,
            uploadedIds: uploadedIds.current,
          }
        : null;
    };
  }, [
    step,
    valence,
    chosen,
    chosenImpacts,
    wordPicker,
    journal,
    promptIndex,
    files,
  ]);

  const label = moodLevelLabel(valence);
  const baseWords = useMemo(
    () =>
      step === 1
        ? browseFeelings(valence)
            .slice(0, feelingPageSize)
            .map((item) => item.word)
        : [],
    [step, valence],
  );
  const suggested = useMemo(() => suggestedImpacts(chosen), [chosen]);
  const prompts = journalPrompts({
    valence,
    feelings: chosen,
    impacts: chosenImpacts,
  });
  const prompt = prompts[promptIndex % prompts.length];

  function go(next: Step) {
    setDirection(next > step ? "forward" : "back");
    setStep(next);
    setError(null);
  }

  function toggle(list: string[], value: string) {
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  }

  async function share() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const mediaIds =
        uploadedIds.current ??
        (files.length ? await uploadMedia(files, setUploadStatus) : []);
      uploadedIds.current = mediaIds;
      const response = await appFetch("/api/mood", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          valence,
          feelings: chosen,
          impacts: chosenImpacts,
          journal,
          prompt: journal.trim() ? prompt : undefined,
          mediaIds,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not share your check-in.");
      shared.current = true;
      savedDraft = null;
      toast.add({ title: "Check-in shared with your circle", type: "success" });
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not connect. Your check-in is still here.",
      );
    } finally {
      setUploadStatus("");
      setPending(false);
    }
  }

  const header = [
    { title: "How are you feeling?", description: null },
    {
      title: "What describes this feeling?",
      description:
        "Pick any that fit, even mixed feelings. Tap a word to discover more.",
    },
    { title: "What’s having the biggest impact?", description: null },
    { title: prompt, description: "Optional. Your circle will see it." },
  ][step];

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) setOpen(false);
      }}
      // Unmount only after the sheet has slid away.
      onOpenChangeComplete={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="social-composer mood-sheet"
        showCloseButton={!pending}
        style={moodStyle(valence)}
      >
        <SheetHeader>
          <div className="mood-progress" aria-hidden="true">
            {steps.map((index) => (
              <span key={index} data-done={index <= step || undefined} />
            ))}
          </div>
          <p className="sr-only" aria-live="polite">
            Step {step + 1} of {stepCount}
          </p>
          <div className="flex items-start gap-2">
            <SheetTitle className="flex-1">{header.title}</SheetTitle>
            {step === 3 && prompts.length > 1 && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="-mr-1 shrink-0"
                aria-label="Try another prompt"
                disabled={pending}
                onClick={() => setPromptIndex((index) => index + 1)}
              >
                <Shuffle />
              </Button>
            )}
          </div>
          {header.description && (
            <SheetDescription>{header.description}</SheetDescription>
          )}
        </SheetHeader>

        <div key={step} className="mood-sheet-body" data-direction={direction}>
          {step === 0 && (
            <div className="mood-hero">
              <div className="mood-orb">
                <div className="mood-orb-glow" />
                <MoodShape valence={valence} animate />
              </div>
              <p key={moodLevel(valence)} className="mood-level">
                {label}
              </p>
              <div className="mood-slider-wrap">
                <Slider
                  className="mood-slider"
                  min={-100}
                  max={100}
                  step={1}
                  value={[valence]}
                  style={{ "--mood-track": moodGradient } as CSSProperties}
                  thumbProps={{
                    getAriaLabel: () => "How pleasant or unpleasant you feel",
                    getAriaValueText: () => label,
                  }}
                  onValueChange={(value) => {
                    const next = Array.isArray(value) ? value[0] : value;
                    if (moodLevel(next) !== moodLevel(valence))
                      navigator.vibrate?.(8);
                    setValence(next);
                  }}
                />
                <div className="mood-slider-ends" aria-hidden="true">
                  <span>Very unpleasant</span>
                  <span>Very pleasant</span>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <FeelingPicker
              base={baseWords}
              chosen={chosen}
              onToggle={(word) => setChosen((list) => toggle(list, word))}
              state={wordPicker}
              onStateChange={setWordPicker}
            />
          )}

          {step === 2 && (
            <>
              {suggested.length > 0 && (
                <section aria-labelledby="mood-impacts-suggested">
                  <h3 id="mood-impacts-suggested" className="mood-group-label">
                    Suggested
                  </h3>
                  <ImpactChips
                    ids={suggested}
                    chosen={chosenImpacts}
                    onToggle={(id) =>
                      setChosenImpacts((list) => toggle(list, id))
                    }
                  />
                </section>
              )}
              <section
                aria-labelledby={
                  suggested.length ? "mood-impacts-more" : undefined
                }
                aria-label={suggested.length ? undefined : "Impacts"}
              >
                {suggested.length > 0 && (
                  <h3 id="mood-impacts-more" className="mood-group-label">
                    More
                  </h3>
                )}
                <ImpactChips
                  ids={impacts
                    .map((impact) => impact.id)
                    .filter((id) => !suggested.includes(id))}
                  chosen={chosenImpacts}
                  onToggle={(id) =>
                    setChosenImpacts((list) => toggle(list, id))
                  }
                />
              </section>
            </>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div className="mood-summary">
                <MoodShape valence={valence} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="mood-summary-level">{label}</p>
                  {chosen.length > 0 && (
                    <p className="mood-summary-feelings">
                      {formatFeelings(chosen)}
                    </p>
                  )}
                  <ImpactList ids={chosenImpacts} className="mt-1.5" />
                </div>
              </div>
              <Textarea
                aria-label={prompt}
                className="mood-journal"
                placeholder="Write as much or as little as you like."
                value={journal}
                onChange={(event) => setJournal(event.target.value)}
                maxLength={5000}
                rows={5}
                disabled={pending}
              />
              {journal.length > 4500 && (
                <p className="-mt-2 text-xs text-muted-foreground tabular-nums">
                  {journal.length.toLocaleString()}/5,000
                </p>
              )}
              {showMedia || files.length ? (
                <MediaPicker
                  files={files}
                  disabled={pending}
                  onChange={(next) => {
                    setFiles(next);
                    uploadedIds.current = null;
                  }}
                />
              ) : (
                <Button
                  variant="outline"
                  className="self-start"
                  disabled={pending}
                  onClick={() => setShowMedia(true)}
                >
                  <ImagePlus data-icon="inline-start" />
                  Add photos or videos
                </Button>
              )}
              <UploadStatus status={uploadStatus} percent={uploadPercent} />
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Could not share</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        {step === 1 && chosen.length > 0 && (
          <section className="mood-selected" aria-label="Selected feelings">
            <p className="mood-selected-count">{chosen.length} selected</p>
            <div className="mood-selected-words">
              {chosen.map((word) => (
                <Button
                  key={word}
                  variant="outline"
                  size="sm"
                  className="mood-selected-word"
                  aria-label={`Remove ${word}`}
                  onClick={() => setChosen((list) => toggle(list, word))}
                >
                  {word}
                  <X data-icon="inline-end" aria-hidden="true" />
                </Button>
              ))}
            </div>
          </section>
        )}
        <SheetFooter className="flex-row">
          {step > 0 && (
            <Button
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => go((step - 1) as Step)}
            >
              <ArrowLeft data-icon="inline-start" />
              Back
            </Button>
          )}
          <Button
            size="lg"
            className="mood-primary flex-1"
            disabled={pending}
            onClick={() => (step === 3 ? share() : go((step + 1) as Step))}
          >
            {pending && <Spinner data-icon="inline-start" />}
            {step === 3
              ? pending
                ? "Sharing…"
                : "Share check-in"
              : (step === 1 && !chosen.length) ||
                  (step === 2 && !chosenImpacts.length)
                ? "Skip"
                : "Next"}
            {step < 3 && <ArrowRight data-icon="inline-end" />}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ImpactChips({
  ids,
  chosen,
  onToggle,
}: {
  ids: readonly string[];
  chosen: readonly string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="mood-chips">
      {ids.map((id) => {
        const impact = impacts.find((item) => item.id === id);
        if (!impact) return null;
        return (
          <Toggle
            key={id}
            className="mood-chip"
            pressed={chosen.includes(id)}
            onPressedChange={() => onToggle(id)}
          >
            <ImpactIcon id={id} />
            {impact.label}
          </Toggle>
        );
      })}
    </div>
  );
}
