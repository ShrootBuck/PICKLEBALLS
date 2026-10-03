"use client";

import {
  Ban,
  ChevronDown,
  Lock,
  Pencil,
  Plus,
  Sprout,
  Users,
} from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { appFetch } from "@/lib/app-refresh";
import { newStreakHash } from "@/lib/navigation";
import {
  hundredthsToInput,
  isSingleEmoji,
  parseMoneyInput,
  parseUnitsInput,
  type StreakKind,
  type StreakView,
  type StreakVisibility,
} from "@/lib/streak-policy";
import { cn } from "@/lib/utils";

const suggestions: Record<StreakKind, string[]> = {
  QUIT: [
    "☕",
    "🚬",
    "📱",
    "🍬",
    "🍺",
    "🎮",
    "🍔",
    "🥤",
    "🛒",
    "💸",
    "🍷",
    "😴",
  ],
  BUILD: ["📖", "🏋️", "🧘", "🏃", "💧", "✍️", "🥗", "🎸", "🧠", "🚶", "🌅", "🛏️"],
};
const defaultEmoji: Record<StreakKind, string> = { QUIT: "🚫", BUILD: "✅" };

export function StreakForm({
  circleId,
  streak,
  openFromLink = false,
  open: controlledOpen,
  onOpenChange,
}: {
  circleId: string;
  streak?: StreakView;
  // Open when the page was reached through newStreakHref.
  openFromLink?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const id = useId();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const [kind, setKind] = useState<StreakKind>(streak?.kind ?? "QUIT");
  const [title, setTitle] = useState(streak?.title ?? "");
  const [emoji, setEmoji] = useState(streak?.emoji ?? defaultEmoji.QUIT);
  const [visibility, setVisibility] = useState<StreakVisibility>("CIRCLE");
  const [money, setMoney] = useState(
    hundredthsToInput(streak?.dailyCostCents ?? null),
  );
  const [units, setUnits] = useState(
    hundredthsToInput(streak?.dailyUnits ?? null),
  );
  const [unitLabel, setUnitLabel] = useState(streak?.unitLabel ?? "");
  const [showAmounts, setShowAmounts] = useState(
    Boolean(streak?.dailyCostCents || streak?.dailyUnits),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Links open the form with #new. A hash, unlike a search param, is not part
  // of the page's key, so clearing it later cannot remount the page and close
  // this dialog.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount
  useEffect(() => {
    if (!openFromLink || window.location.hash !== newStreakHash) return;
    // Clear the hash first so a refresh doesn't open the form again.
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    setInternalOpen(true);
  }, []);

  function reset() {
    setKind(streak?.kind ?? "QUIT");
    setTitle(streak?.title ?? "");
    setEmoji(streak?.emoji ?? defaultEmoji.QUIT);
    setVisibility("CIRCLE");
    setMoney(hundredthsToInput(streak?.dailyCostCents ?? null));
    setUnits(hundredthsToInput(streak?.dailyUnits ?? null));
    setUnitLabel(streak?.unitLabel ?? "");
    setShowAmounts(Boolean(streak?.dailyCostCents || streak?.dailyUnits));
    setError(null);
  }

  function setOpen(next: boolean) {
    if (pending) return;
    if (next) reset();
    onOpenChange?.(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const dailyCostCents = kind === "QUIT" ? parseMoneyInput(money) : null;
    const dailyUnits = parseUnitsInput(units);
    const label = unitLabel.trim() || null;
    const problem = !title.trim()
      ? "Name your streak."
      : !isSingleEmoji(emoji)
        ? "Pick one emoji."
        : dailyCostCents === undefined
          ? "Enter money saved like 5 or 5.50."
          : dailyUnits === undefined
            ? "Enter an amount like 10 or 1.5."
            : dailyUnits !== null && !label
              ? "Add a unit, like cups or pages."
              : dailyUnits === null && label
                ? `Add how many ${label} ${kind === "QUIT" ? "per day" : "per log"}, or clear the unit.`
                : null;
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const details = {
        title,
        emoji: emoji.trim(),
        dailyCostCents,
        dailyUnits,
        unitLabel: label,
      };
      const response = await appFetch(
        streak
          ? `/api/streaks/${encodeURIComponent(streak.id)}`
          : "/api/streaks",
        {
          method: streak ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            streak
              ? { action: "details", ...details }
              : { circleId, kind, visibility, ...details },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not save your streak.");
      toast.add({
        title: streak
          ? "Streak updated."
          : "Streak started. Day one begins now.",
        type: "success",
      });
      setPending(false);
      onOpenChange?.(false);
      if (controlledOpen === undefined) setInternalOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save. Try again.",
      );
      setPending(false);
    }
  }

  return (
    <>
      {controlledOpen === undefined && (
        <Button
          variant={streak ? "outline" : "default"}
          size={streak ? "sm" : "default"}
          onClick={() => setOpen(true)}
        >
          {streak ? (
            <Pencil data-icon="inline-start" />
          ) : (
            <Plus data-icon="inline-start" />
          )}
          {streak ? "Edit streak" : "New streak"}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={!pending} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {streak ? "Edit your streak" : "Start a streak"}
            </DialogTitle>
            <DialogDescription>
              {streak
                ? "Amount changes only apply going forward. Past days keep what they were worth."
                : "One honest check-in a day. Your circle has your back."}
            </DialogDescription>
          </DialogHeader>
          <form id={`streak-${id}`} onSubmit={submit} aria-busy={pending}>
            <FieldGroup>
              {!streak && (
                <Field>
                  <FieldLabel id={`${id}-kind`}>
                    What kind of streak?
                  </FieldLabel>
                  <ToggleGroup
                    aria-labelledby={`${id}-kind`}
                    value={[kind]}
                    onValueChange={(value) => {
                      const next = value[0] as StreakKind | undefined;
                      if (!next) return;
                      if (emoji === defaultEmoji[kind])
                        setEmoji(defaultEmoji[next]);
                      setKind(next);
                    }}
                    variant="outline"
                    spacing={2}
                    className="w-full"
                    disabled={pending}
                  >
                    <ToggleGroupItem value="QUIT" className="flex-1">
                      <Ban /> Quit something
                    </ToggleGroupItem>
                    <ToggleGroupItem value="BUILD" className="flex-1">
                      <Sprout /> Build something
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <FieldDescription>
                    {kind === "QUIT"
                      ? "Each day counts once it’s over and you confirm it was clean. Log a slip whenever it happens."
                      : "Log it any time during the day. Log more than once and the amounts add up."}
                  </FieldDescription>
                </Field>
              )}
              <Field data-disabled={pending}>
                <FieldLabel htmlFor={`${id}-title`}>Name</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    aria-label="Emoji"
                    value={emoji}
                    onChange={(event) => setEmoji(event.target.value)}
                    className="w-14 shrink-0 text-center text-xl"
                    maxLength={16}
                    disabled={pending}
                  />
                  <Input
                    id={`${id}-title`}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={
                      kind === "QUIT" ? "No caffeine" : "Read every day"
                    }
                    maxLength={80}
                    required
                    disabled={pending}
                    autoFocus
                  />
                </div>
                <fieldset className="flex min-w-0 flex-wrap gap-1">
                  <legend className="sr-only">Suggested emoji</legend>
                  {suggestions[kind].map((item) => (
                    <Button
                      key={item}
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Use ${item}`}
                      aria-pressed={emoji === item}
                      className={cn("text-lg", emoji === item && "bg-accent")}
                      disabled={pending}
                      onClick={() => setEmoji(item)}
                    >
                      {item}
                    </Button>
                  ))}
                </fieldset>
              </Field>
              {!streak && (
                <Field>
                  <FieldLabel id={`${id}-visibility`}>
                    Who can see it?
                  </FieldLabel>
                  <ToggleGroup
                    aria-labelledby={`${id}-visibility`}
                    value={[visibility]}
                    onValueChange={(value) => {
                      if (value[0]) setVisibility(value[0] as StreakVisibility);
                    }}
                    variant="outline"
                    spacing={2}
                    className="w-full"
                    disabled={pending}
                  >
                    <ToggleGroupItem value="CIRCLE" className="flex-1">
                      <Users /> Your circle
                    </ToggleGroupItem>
                    <ToggleGroupItem value="PRIVATE" className="flex-1">
                      <Lock /> Only you
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <FieldDescription>
                    {visibility === "CIRCLE"
                      ? "Friends see it on your profile, its start and milestones post to the feed, and they can nudge you."
                      : "Only you can see it. Nothing posts to the feed."}{" "}
                    <strong className="font-medium text-foreground">
                      This can’t be changed later.
                    </strong>
                  </FieldDescription>
                </Field>
              )}
              <div className="flex flex-col gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  aria-expanded={showAmounts}
                  aria-controls={`${id}-amounts`}
                  onClick={() => setShowAmounts((value) => !value)}
                >
                  <ChevronDown
                    data-icon="inline-start"
                    className={cn(
                      "transition-transform",
                      showAmounts && "rotate-180",
                    )}
                  />
                  {kind === "QUIT"
                    ? "Track money saved and amounts (optional)"
                    : "Track amounts, like pages (optional)"}
                </Button>
                {showAmounts && (
                  <div id={`${id}-amounts`} className="flex flex-col gap-4">
                    {kind === "QUIT" && (
                      <Field data-disabled={pending}>
                        <FieldLabel htmlFor={`${id}-money`}>
                          Money saved per day ($)
                        </FieldLabel>
                        <Input
                          id={`${id}-money`}
                          inputMode="decimal"
                          value={money}
                          onChange={(event) => setMoney(event.target.value)}
                          placeholder="5.00"
                          disabled={pending}
                        />
                      </Field>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <Field data-disabled={pending}>
                        <FieldLabel htmlFor={`${id}-units`}>
                          {kind === "QUIT" ? "Amount per day" : "Usual amount"}
                        </FieldLabel>
                        <Input
                          id={`${id}-units`}
                          inputMode="decimal"
                          value={units}
                          onChange={(event) => setUnits(event.target.value)}
                          placeholder={kind === "QUIT" ? "3" : "10"}
                          disabled={pending}
                        />
                      </Field>
                      <Field data-disabled={pending}>
                        <FieldLabel htmlFor={`${id}-unit`}>Unit</FieldLabel>
                        <Input
                          id={`${id}-unit`}
                          value={unitLabel}
                          onChange={(event) => setUnitLabel(event.target.value)}
                          placeholder={kind === "QUIT" ? "cups" : "pages"}
                          maxLength={24}
                          disabled={pending}
                        />
                      </Field>
                    </div>
                    <FieldDescription>
                      {kind === "QUIT"
                        ? "Every clean day adds these to your totals, like “$60 saved, 36 cups skipped.”"
                        : "Each log starts with this amount, and you can change it every time."}
                    </FieldDescription>
                  </div>
                )}
              </div>
            </FieldGroup>
          </form>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" form={`streak-${id}`} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {streak ? "Save changes" : "Start streak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
