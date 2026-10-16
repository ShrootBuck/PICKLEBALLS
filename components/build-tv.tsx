"use client";

import { Check, CirclePause, LoaderCircle, Package, Tv, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BUILD_TV_STALE_MS,
  type BuildStatus,
  type BuildTVResponse,
  buildStatusLabels,
  buildTVHeadline,
  buildTVResponseSchema,
} from "@/lib/build-tv";

const number = new Intl.NumberFormat("en-US");
const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function useBuildTV(open: boolean) {
  const [data, setData] = useState<BuildTVResponse | null>(null);
  useEffect(() => {
    let stopped = false;
    let signedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    function lostSignal() {
      setData((previous) => {
        const snapshot = previous?.snapshot;
        const recent =
          snapshot &&
          Date.now() - Date.parse(snapshot.updatedAt) <= BUILD_TV_STALE_MS
            ? snapshot
            : null;
        return {
          connection: recent ? "reconnecting" : "offline",
          snapshot: recent,
        };
      });
    }
    async function poll() {
      if (stopped || signedOut || document.hidden || !navigator.onLine) return;
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch("/api/build-tv", {
          cache: "no-store",
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]),
        });
        if (response.status === 401) signedOut = true;
        if (!response.ok) throw new Error("Signal lost");
        const next = buildTVResponseSchema.parse(await response.json());
        if (!stopped && !request.signal.aborted) setData(next);
      } catch {
        if (!stopped && !request.signal.aborted) lostSignal();
      } finally {
        if (!stopped && !request.signal.aborted && !signedOut)
          timer = setTimeout(poll, open ? 5_000 : 60_000);
      }
    }
    function resume() {
      clearTimeout(timer);
      controller?.abort();
      if (!navigator.onLine) lostSignal();
      void poll();
    }
    resume();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, [open]);
  return data;
}

function StatusBadge({
  status,
  animate,
}: {
  status: BuildStatus;
  animate: boolean;
}) {
  const Icon =
    status === "in_progress"
      ? LoaderCircle
      : status === "finished"
        ? Check
        : status === "failed"
          ? X
          : CirclePause;
  return (
    <Badge
      variant={
        status === "failed"
          ? "destructive"
          : status === "finished"
            ? "success"
            : "secondary"
      }
    >
      <Icon
        aria-hidden="true"
        className={
          status === "in_progress" && animate
            ? "motion-safe:animate-spin"
            : undefined
        }
      />
      {buildStatusLabels[status]}
    </Badge>
  );
}

function since(date: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(date)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function BuildTV() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const data = useBuildTV(open);
  useEffect(() => {
    if (!open) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, [open]);
  const snapshot =
    data?.snapshot &&
    now - Date.parse(data.snapshot.updatedAt) <= BUILD_TV_STALE_MS
      ? data.snapshot
      : null;
  const connected = data?.connection === "connected" && Boolean(snapshot);
  const queued = snapshot?.queued ?? 0;
  const running = snapshot?.running ?? 0;
  const busy = queued + running > 0;
  const title = !data
    ? "Tuning in..."
    : data.connection === "unconfigured"
      ? "Off air."
      : !connected
        ? "Lost the signal."
        : buildTVHeadline(queued, running);
  const caption = !data
    ? "Finding the build channel."
    : data.connection === "unconfigured"
      ? "Build TV hasn't been connected yet."
      : !connected
        ? "Trying to tune back in."
        : queued >= 100
          ? "Someone has been very busy pushing."
          : queued >= 10
            ? "One server. Many ambitions."
            : busy
              ? "Please enjoy this extremely important broadcast."
              : "The queue is empty. Suspiciously peaceful.";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="build-tv-trigger"
            aria-label={`Open Build TV${connected && busy ? `, ${number.format(queued)} queued, ${number.format(running)} building` : ""}`}
            title="Build TV"
          />
        }
      >
        <Tv data-icon="inline-start" />
        <span className="hidden sm:inline">Build TV</span>
        {connected && busy && (
          <Badge className="hidden sm:inline-flex">
            {compactNumber.format(queued + running)}
          </Badge>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" data-build-tv="">
        <DialogHeader>
          <DialogTitle>Build TV</DialogTitle>
          <DialogDescription>
            Pickle Balls deployments. A spectator sport.
          </DialogDescription>
        </DialogHeader>

        <div className="build-tv-screen" data-moving={connected && busy}>
          <div className="build-tv-channel">
            <span>PB / CH. 01</span>
            <span className="flex items-center gap-1.5">
              <span className="build-tv-led" data-on={connected} />
              {connected ? "ON AIR" : data ? "NO SIGNAL" : "TUNING IN"}
            </span>
          </div>
          <div className="build-tv-picture" aria-hidden="true">
            <div className="build-tv-parcels">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
                <span key={index} className="build-tv-parcel">
                  <Package />
                </span>
              ))}
            </div>
            <div className="build-tv-belt" />
          </div>
          <div className="build-tv-programme" aria-live="polite">
            <h2>{title}</h2>
            <p>{caption}</p>
          </div>
          {!data ? (
            <section
              className="grid grid-cols-2 gap-3 p-4"
              aria-label="Loading deployment counts"
            >
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </section>
          ) : (
            <dl
              className="build-tv-counts"
              aria-label={
                connected ? "Deployment counts" : "Last known deployment counts"
              }
            >
              <div>
                <dt>Building</dt>
                <dd>{snapshot ? number.format(running) : "?"}</dd>
              </div>
              <div>
                <dt>Queued</dt>
                <dd>{snapshot ? number.format(queued) : "?"}</dd>
              </div>
            </dl>
          )}
        </div>

        {snapshot && (
          <section
            className="flex flex-col gap-3"
            aria-label="Latest deployments"
          >
            {snapshot.services.map((service) => (
              <div
                key={service.key}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-sm font-medium">
                    {service.key === "web" ? "Website" : "Background worker"}
                  </p>
                  <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    {service.queued + service.running > 0 ? (
                      <span>
                        {number.format(service.running)} building ·{" "}
                        {number.format(service.queued)} queued
                      </span>
                    ) : (
                      <span>Queue clear</span>
                    )}
                    {service.latest?.commit && (
                      <span className="font-mono">{service.latest.commit}</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {service.latest ? (
                    <>
                      <StatusBadge
                        status={service.latest.status}
                        animate={connected}
                      />
                      <span className="text-xs text-muted-foreground">
                        Queued {since(service.latest.createdAt, now)} ago
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No builds yet
                    </span>
                  )}
                </div>
                {service.latest?.commitMessage && (
                  <p className="w-full min-w-0 border-t pt-2 text-sm leading-relaxed break-words [overflow-wrap:anywhere]">
                    {service.latest.commitMessage}
                  </p>
                )}
              </div>
            ))}
          </section>
        )}
        <p className="text-center text-xs text-muted-foreground">
          {snapshot
            ? `${connected ? "Updated" : "Last signal"} ${since(snapshot.updatedAt, now)} ago${connected ? " · Refreshes while you watch" : " · Counts may have changed"}`
            : data?.connection === "unconfigured"
              ? "Check back for the premiere."
              : "Waiting for a signal"}
        </p>
      </DialogContent>
    </Dialog>
  );
}
