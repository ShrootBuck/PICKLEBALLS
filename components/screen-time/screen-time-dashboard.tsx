"use client";

import { Bot, Clock3, FileImage, Save, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Cadence = "DAILY" | "WEEKLY";
type Extraction = {
  cadence: Cadence | "UNKNOWN";
  periodStart: string | null;
  periodEnd: string | null;
  dailyAverageMinutes: number | null;
  totalScreenTimeMinutes: number | null;
  socialMinutes: number | null;
  pickups: number | null;
  comparisonPercent: number | null;
  topApps: Array<{ name: string; minutes: number }>;
  summary: string;
  confidence: number;
  warnings: string[];
};

type Receipt = {
  id: string;
  cadence: Cadence;
  periodStart: string;
  periodEnd: string;
  dailyAverageMinutes: number | null;
  totalScreenTimeMinutes: number | null;
  socialMinutes: number | null;
  pickups: number | null;
  hasUserCorrections: boolean;
  hasImage: boolean;
  ownerName: string;
};

const chartConfig = {
  minutes: { label: "Daily average", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function ScreenTimeDashboard({
  periods,
  receipts,
}: {
  periods: Record<Cadence, { start: string; end: string }>;
  receipts: Receipt[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cadence, setCadence] = useState<Cadence>("DAILY");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  async function analyze() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Attach a screenshot first.");
    setAnalyzing(true);
    setError(null);
    const form = new FormData();
    form.set("image", file);
    const response = await fetch("/api/screen-time/analyze", {
      method: "POST",
      body: form,
    });
    const body = (await response.json()) as {
      extraction?: Extraction;
      error?: string;
    };
    if (!response.ok || !body.extraction) {
      setError(body.error ?? "The model could not read it. We'll still save the image.");
      setExtraction(null);
    } else {
      const value = body.extraction;
      setExtraction(value);
      if (value.cadence !== "UNKNOWN") setCadence(value.cadence);
      toast.add({
        title: value.confidence > 0.7 ? "AI read the receipt." : "AI gave it a shot — image is what matters.",
        type: "info",
      });
    }
    setAnalyzing(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Attach a screenshot first.");
    setSaving(true);
    setError(null);

    // Auto-run AI if not yet done — but don't block save if it fails
    let currentExtraction = extraction;
    if (!currentExtraction) {
      try {
        const form = new FormData();
        form.set("image", file);
        const response = await fetch("/api/screen-time/analyze", {
          method: "POST",
          body: form,
        });
        const body = (await response.json()) as {
          extraction?: Extraction;
          error?: string;
        };
        if (response.ok && body.extraction) {
          currentExtraction = body.extraction;
          setExtraction(currentExtraction);
          if (currentExtraction.cadence !== "UNKNOWN") setCadence(currentExtraction.cadence);
        }
      } catch {
        // LLM failure is fine — we still care about the image
      }
    }

    const effectiveCadence =
      currentExtraction?.cadence && currentExtraction.cadence !== "UNKNOWN"
        ? currentExtraction.cadence
        : cadence;
    const periodStart =
      currentExtraction?.periodStart ?? periods[effectiveCadence].start;
    const periodEnd =
      currentExtraction?.periodEnd ?? periods[effectiveCadence].end;

    const form = new FormData();
    form.set("image", file);
    form.set(
      "receipt",
      JSON.stringify({
        cadence: effectiveCadence,
        periodStart,
        periodEnd,
        dailyAverageMinutes: currentExtraction?.dailyAverageMinutes ?? null,
        totalScreenTimeMinutes: currentExtraction?.totalScreenTimeMinutes ?? null,
        socialMinutes: currentExtraction?.socialMinutes ?? null,
        pickups: currentExtraction?.pickups ?? null,
        comparisonPercent: currentExtraction?.comparisonPercent ?? null,
        topApps: currentExtraction?.topApps ?? [],
        summary: currentExtraction?.summary ?? null,
        confidence: currentExtraction?.confidence ?? null,
        warnings: currentExtraction?.warnings ?? [],
        originalAIExtraction: currentExtraction,
        hasUserCorrections: false,
      }),
    );
    const response = await fetch("/api/screen-time/receipts", {
      method: "POST",
      body: form,
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) setError(body.error ?? "Could not save receipt.");
    else {
      toast.add({ title: "Screen Time receipt posted.", type: "success" });
      setExtraction(null);
      if (fileRef.current) fileRef.current.value = "";
      setSelectedFileName(null);
      router.refresh();
    }
    setSaving(false);
  }

  const chartData = receipts
    .filter((receipt) => receipt.dailyAverageMinutes !== null)
    .slice()
    .reverse()
    .map((receipt) => ({
      label: receipt.periodStart.slice(5),
      minutes: receipt.dailyAverageMinutes,
    }));

  return (
    <>
      <section className="flex flex-col gap-1">
        <Badge variant="secondary" className="w-fit">
          Separate receipt flow
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Screen Time, no crossover episode.
        </h1>
        <p className="text-sm text-muted-foreground md:text-base">
          This is not task proof. It is its own daily or weekly honesty receipt.
        </p>
      </section>

      <Tabs defaultValue="submit" className="w-full">
        <ScrollArea className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="submit" className="flex-1 sm:flex-none">
              Post receipt
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 sm:flex-none">
              History
            </TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>
        <TabsContent value="submit" className="mt-4">
          <Card>
            <CardHeader>
              <Clock3 />
              <CardTitle>Daily by default. Weekly when useful.</CardTitle>
              <CardDescription>
                Just post the image. The LLM reads it — if it fails, we still keep the image.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={save} className="flex flex-col gap-5">
                <FieldGroup>
                  <Field orientation="responsive">
                    <FieldTitle id="cadence-label">Cadence</FieldTitle>
                    <ToggleGroup
                      value={[cadence]}
                      onValueChange={(value) =>
                        value[0] && setCadence(value[0] as Cadence)
                      }
                      aria-labelledby="cadence-label"
                      variant="outline"
                      spacing={2}
                      className="w-full sm:w-fit"
                    >
                      <ToggleGroupItem
                        value="DAILY"
                        className="flex-1 sm:flex-none"
                      >
                        Daily
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="WEEKLY"
                        className="flex-1 sm:flex-none"
                      >
                        Weekly
                      </ToggleGroupItem>
                    </ToggleGroup>
                    <FieldDescription>
                      Auto-detected from screenshot when possible. You can override.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel>Screenshot</FieldLabel>
                    <div className="flex flex-col gap-2 rounded-xl border border-dashed bg-muted/20 p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                          <Upload className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {selectedFileName ?? "Tap to choose screenshot"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            PNG, JPEG, WebP, or HEIC. Max 6 MB. Sanitized and
                            kept 30 days.
                          </p>
                        </div>
                        {selectedFileName && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              if (fileRef.current) fileRef.current.value = "";
                              setSelectedFileName(null);
                              setExtraction(null);
                            }}
                            aria-label="Clear file"
                          >
                            <X />
                          </Button>
                        )}
                      </div>
                      <input
                        ref={fileRef}
                        id="screen-time-image"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/heic"
                        required
                        className="h-11 cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium block w-full text-sm text-muted-foreground file:text-foreground"
                        onChange={(e) =>
                          setSelectedFileName(e.target.files?.[0]?.name ?? null)
                        }
                      />
                    </div>
                    <FieldDescription>
                      Images are sanitized and kept for 30 days. The LLM does the reading — no manual typing needed.
                    </FieldDescription>
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={analyze}
                    disabled={analyzing}
                    size="lg"
                    className="w-full sm:w-auto"
                  >
                    {analyzing ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <Bot data-icon="inline-start" />
                    )}
                    {analyzing ? "Reading screenshot…" : "Read with AI (optional)"}
                  </Button>
                </FieldGroup>
                {extraction && (
                  <Alert>
                    <Bot />
                    <AlertTitle>
                      Model read · {Math.round(extraction.confidence * 100)}%
                      confidence
                    </AlertTitle>
                    <AlertDescription>
                      {extraction.summary}
                      {extraction.warnings.length
                        ? ` Check: ${extraction.warnings.join("; ")}`
                        : ""}
                    </AlertDescription>
                  </Alert>
                )}
                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>Receipt problem.</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  disabled={saving}
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  {saving ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Save data-icon="inline-start" />
                  )}
                  Save receipt
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Daily average trend</CardTitle>
                <CardDescription>Confirmed values only.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-hidden">
                <ChartContainer
                  config={chartConfig}
                  className="min-h-[220px] w-full"
                >
                  <BarChart data={chartData} accessibilityLayer>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="minutes"
                      fill="var(--color-minutes)"
                      radius={6}
                    />
                  </BarChart>
                </ChartContainer>
                {chartData.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No data yet. Post a receipt to see the trend.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Squad receipts</CardTitle>
                <CardDescription>
                  Daily and weekly stay explicit.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                <ScrollArea className="w-full whitespace-nowrap">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Who</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Average</TableHead>
                        <TableHead>Cadence</TableHead>
                        <TableHead className="text-right">Receipt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receipts.map((receipt) => (
                        <TableRow key={receipt.id}>
                          <TableCell className="font-medium">
                            {receipt.ownerName}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {receipt.periodStart}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {receipt.dailyAverageMinutes ?? "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="secondary">
                                {receipt.cadence.toLowerCase()}
                              </Badge>
                              {receipt.hasUserCorrections && (
                                <Badge variant="outline">corrected</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {receipt.hasImage ? (
                              <Button
                                render={
                                  <Link
                                    href={`/api/screen-time/receipts/${receipt.id}/image`}
                                    target="_blank"
                                  />
                                }
                                nativeButton={false}
                                size="sm"
                                variant="outline"
                              >
                                <FileImage data-icon="inline-start" />
                                View
                              </Button>
                            ) : (
                              <Badge variant="outline">manual</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {receipts.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="py-8 text-center text-sm text-muted-foreground"
                          >
                            No receipts yet. Be the first.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
