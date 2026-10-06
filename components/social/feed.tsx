"use client";

import { Camera, RefreshCw } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { PostCard } from "@/components/social/post-card";
import { PullToRefresh } from "@/components/social/pull-to-refresh";
import { useSocial } from "@/components/social/social-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { requestAppRefresh } from "@/lib/app-refresh";
import { reconcileFeed, refreshFeedPages } from "@/lib/feed-state";
import { type FeedPage, type FeedPost, postKey } from "@/lib/social-types";

export function Feed({
  initial,
  memberId,
}: {
  initial: FeedPage;
  memberId?: string;
}) {
  const { feeds, openComposer, postRevision } = useSocial();
  const key = memberId ?? "home";
  const signature = JSON.stringify(initial);
  const previousSignature = useRef(signature);
  const [page, setPage] = useState<FeedPage>(() => {
    const cached = feeds.get(key);
    return cached
      ? cached.serverSignature === signature
        ? cached
        : reconcileFeed(cached, initial)
      : initial;
  });
  const [busy, setBusy] = useState<"refresh" | "older" | null>(null);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const requestEpoch = useRef(0);
  useEffect(() => {
    if (postRevision > 0) {
      const cached = feeds.get(key);
      if (cached) setPage(cached);
    }
  }, [postRevision, feeds, key]);
  useEffect(() => {
    if (previousSignature.current !== signature) {
      previousSignature.current = signature;
      requestEpoch.current += 1;
      controller.current?.abort();
      setPage((current) => reconcileFeed(current, initial));
    }
  }, [initial, signature]);
  useEffect(() => {
    feeds.set(key, { ...page, serverSignature: previousSignature.current });
  }, [page, feeds, key]);
  useEffect(
    () => () => {
      requestEpoch.current += 1;
      controller.current?.abort();
    },
    [],
  );

  async function load(mode: "refresh" | "older") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(mode);
    setError(null);
    const epoch = ++requestEpoch.current;
    const request = new AbortController();
    controller.current = request;
    try {
      async function readPage(cursor?: string): Promise<FeedPage> {
        const query = new URLSearchParams();
        if (memberId) query.set("memberId", memberId);
        if (cursor) query.set("cursor", cursor);
        const response = await fetch(`/api/feed?${query}`, {
          cache: "no-store",
          signal: AbortSignal.any([
            request.signal,
            AbortSignal.timeout(20_000),
          ]),
        });
        if (!response.ok || requestEpoch.current !== epoch)
          throw new Error("Could not load posts.");
        return response.json();
      }
      const fresh =
        mode === "refresh"
          ? await refreshFeedPages(page, readPage)
          : await readPage(page.nextCursor ?? undefined);
      if (requestEpoch.current !== epoch) return;
      setPage((current) =>
        mode === "refresh"
          ? fresh
          : {
              items: [
                ...current.items,
                ...fresh.items.filter(
                  (p) =>
                    !current.items.some((old) => postKey(old) === postKey(p)),
                ),
              ],
              nextCursor: fresh.nextCursor,
            },
      );
      if (mode === "refresh") requestAppRefresh();
    } catch {
      if (requestEpoch.current === epoch)
        setError("Could not load posts. Check your connection and try again.");
    } finally {
      setBusy(null);
      inFlight.current = false;
    }
  }

  const sentinel = useRef<HTMLDivElement>(null);
  const loadOlder = useEffectEvent(() => {
    if (page.nextCursor && !inFlight.current && !error) void load("older");
  });
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !page.nextCursor || error || busy) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadOlder();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [page.nextCursor, error, busy]);

  return (
    <PullToRefresh
      disabled={busy !== null}
      onRefresh={() => void load("refresh")}
    >
      <section
        className="flex flex-col"
        aria-label={memberId ? "Member posts" : "Circle timeline"}
      >
        <div className="flex min-h-9 items-center justify-between gap-3">
          <h2 className="text-xs font-medium text-muted-foreground">
            {memberId ? "Posts" : "Latest from your circle"}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mr-2 text-muted-foreground"
            aria-label="Refresh posts"
            title="Refresh"
            disabled={busy !== null}
            onClick={() => load("refresh")}
          >
            {busy === "refresh" ? <Spinner /> : <RefreshCw />}
          </Button>
        </div>
        {error && (
          <Alert variant="destructive" className="my-4">
            <AlertTitle>Feed unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {page.items.length ? (
          page.items.map((post) => (
            <PostCard
              key={postKey(post)}
              post={post}
              onChange={(patch) =>
                setPage((current) => ({
                  ...current,
                  items: current.items.map((item) =>
                    postKey(item) === postKey(post)
                      ? ({ ...item, ...patch } as FeedPost)
                      : item,
                  ),
                }))
              }
            />
          ))
        ) : (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Camera />
              </EmptyMedia>
              <EmptyTitle>Good things start here</EmptyTitle>
              <EmptyDescription>
                {memberId
                  ? "Their proof and check-ins will appear here."
                  : "Post some proof or check in."}
              </EmptyDescription>
            </EmptyHeader>
            {!memberId && (
              <Button onClick={() => openComposer()}>
                Make the first move
              </Button>
            )}
          </Empty>
        )}
        <div ref={sentinel} aria-hidden="true" />
        {page.nextCursor ? (
          <Button
            variant="outline"
            className="my-6 self-center"
            disabled={busy !== null}
            onClick={() => load("older")}
          >
            {busy === "older" && <Spinner data-icon="inline-start" />}Load older
          </Button>
        ) : (
          page.items.length > 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              That’s everything for now.
            </p>
          )
        )}
      </section>
    </PullToRefresh>
  );
}
