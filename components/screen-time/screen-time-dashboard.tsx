"use client";

import { Bot, Clock3, FileImage, Save } from "lucide-react";
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

function numberOrNull(value: string) {
  return value === "" ? null : Number(value);
}

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
  const [periodStart, setPeriodStart] = useState(periods.DAILY.start);
  const [periodEnd, setPeriodEnd] = useState(periods.DAILY.end);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    average: "",
    total: "",
    social: "",
    pickups: "",
    comparison: "",
  });

  function chooseCadence(next: Cadence) {
    setCadence(next);
    setPeriodStart(periods[next].start);
    setPeriodEnd(periods[next].end);
  }

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
    if (!response.ok || !body.extraction)
      setError(body.error ?? "The model could not read it.");
    else {
      const value = body.extraction;
      setExtraction(value);
      if (value.cadence !== "UNKNOWN") chooseCadence(value.cadence);
      if (value.periodStart) setPeriodStart(value.periodStart);
      if (value.periodEnd) setPeriodEnd(value.periodEnd);
      setMetrics({
        average: value.dailyAverageMinutes?.toString() ?? "",
        total: value.totalScreenTimeMinutes?.toString() ?? "",
        social: value.socialMinutes?.toString() ?? "",
        pickups: value.pickups?.toString() ?? "",
        comparison: value.comparisonPercent?.toString() ?? "",
      });
      setDirty(false);
      toast.add({
        title: "AI extraction ready for your correction.",
        type: "info",
      });
    }
    setAnalyzing(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData();
    const file = fileRef.current?.files?.[0];
    if (file) form.set("image", file);
    form.set(
      "receipt",
      JSON.stringify({
        cadence,
        periodStart,
        periodEnd,
        dailyAverageMinutes: numberOrNull(metrics.average),
        totalScreenTimeMinutes: numberOrNull(metrics.total),
        socialMinutes: numberOrNull(metrics.social),
        pickups: numberOrNull(metrics.pickups),
        comparisonPercent: numberOrNull(metrics.comparison),
        topApps: extraction?.topApps ?? [],
        summary: extraction?.summary ?? null,
        confidence: extraction?.confidence ?? null,
        warnings: extraction?.warnings ?? [],
        originalAIExtraction: extraction,
        hasUserCorrections: Boolean(extraction && dirty),
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
        <Badge variant="secondary">Separate receipt flow</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">
          Screen Time, no crossover episode.
        </h1>
        <p className="text-muted-foreground">
          This is not task proof. It is its own daily or weekly honesty receipt.
        </p>
      </section>

      <Tabs defaultValue="submit">
        <TabsList>
          <TabsTrigger value="submit">Post receipt</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="submit">
          <Card>
            <CardHeader>
              <Clock3 />
              <CardTitle>Daily by default. Weekly when useful.</CardTitle>
              <CardDescription>
                The model reads the screenshot; you confirm the numbers.
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
                        value[0] && chooseCadence(value[0] as Cadence)
                      }
                      aria-labelledby="cadence-label"
                      variant="outline"
                      spacing={2}
                    >
                      <ToggleGroupItem value="DAILY">Daily</ToggleGroupItem>
                      <ToggleGroupItem value="WEEKLY">Weekly</ToggleGroupItem>
                    </ToggleGroup>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="screen-time-image">
                      Screenshot (optional with manual entry)
                    </FieldLabel>
                    <Input
                      ref={fileRef}
                      id="screen-time-image"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/heic"
                    />
                    <FieldDescription>
                      Images are sanitized and kept for 30 days.
                    </FieldDescription>
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={analyze}
                    disabled={analyzing}
                  >
                    {analyzing ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <Bot data-icon="inline-start" />
                    )}
                    {analyzing ? "Reading screenshot…" : "Read with AI"}
                  </Button>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="period-start">
                        Period start
                      </FieldLabel>
                      <Input
                        id="period-start"
                        type="date"
                        value={periodStart}
                        onChange={(event) => {
                          setPeriodStart(event.target.value);
                          setDirty(true);
                        }}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="period-end">Period end</FieldLabel>
                      <Input
                        id="period-end"
                        type="date"
                        value={periodEnd}
                        onChange={(event) => {
                          setPeriodEnd(event.target.value);
                          setDirty(true);
                        }}
                        required
                      />
                    </Field>
                    {[
                      ["average", "Daily average (minutes)"],
                      ["total", "Total minutes"],
                      ["social", "Social minutes"],
                      ["pickups", "Pickups"],
                      ["comparison", "Change percent"],
                    ].map(([key, label]) => (
                      <Field key={key}>
                        <FieldLabel htmlFor={`metric-${key}`}>
                          {label}
                        </FieldLabel>
                        <Input
                          id={`metric-${key}`}
                          type="number"
                          min={key === "comparison" ? -100 : 0}
                          value={metrics[key as keyof typeof metrics]}
                          onChange={(event) => {
                            setMetrics((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }));
                            setDirty(true);
                          }}
                        />
                      </Field>
                    ))}
                  </div>
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
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Save data-icon="inline-start" />
                  )}
                  Save confirmed receipt
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Daily average trend</CardTitle>
                <CardDescription>Confirmed values only.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig}>
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
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Squad receipts</CardTitle>
                <CardDescription>
                  Daily and weekly stay explicit.
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                        <TableCell>{receipt.ownerName}</TableCell>
                        <TableCell>{receipt.periodStart}</TableCell>
                        <TableCell>
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
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
