"use client";

import { Camera } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { PostCard } from "@/components/social/post-card";
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
import { refreshEvent } from "@/lib/app-refresh";
import { reconcileFeed, refreshFeedPages } from "@/lib/feed-state";
import { type FeedPage, type FeedPost, postKey } from "@/lib/social-types";
import { watchRealtime } from "@/lib/watch-realtime";

export function Feed({
  initial,
  memberId,
  reviewOnly = false,
  timelineOnly = false,
}: {
  initial: FeedPage;
  memberId?: string;
  reviewOnly?: boolean;
  timelineOnly?: boolean;
}) {
  const { feeds, openComposer, postRevision } = useSocial();
  const key = reviewOnly
    ? "!review"
    : timelineOnly
      ? "!timeline"
      : (memberId ?? "home");
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
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<"older" | "sync" | null>(null);
  const controller = useRef<AbortController | null>(null);
  const requestEpoch = useRef(0);
  const syncQueue = useRef<ReturnType<typeof watchRealtime> | null>(null);
  const sync = useEffectEvent(async () => {
    await load("sync");
  });
  useEffect(() => {
    const queue = watchRealtime(
      () => sync(),
      (event) => event.type === "refresh",
      [refreshEvent],
    );
    syncQueue.current = queue;
    return () => queue.dispose();
  }, []);
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

  async function load(mode: "older" | "sync") {
    if (inFlight.current) {
      if (mode === "sync") throw new Error("A feed read is already running.");
      return;
    }
    inFlight.current = true;
    if (mode !== "sync") {
      setBusy(true);
      setError(null);
    }
    const epoch = ++requestEpoch.current;
    const request = new AbortController();
    controller.current = request;
    try {
      async function readPage(cursor?: string): Promise<FeedPage> {
        const query = new URLSearchParams();
        if (memberId) query.set("memberId", memberId);
        if (reviewOnly) query.set("filter", "review");
        if (timelineOnly) query.set("filter", "timeline");
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
        mode !== "older"
          ? await refreshFeedPages(page, readPage)
          : await readPage(page.nextCursor ?? undefined);
      if (requestEpoch.current !== epoch) {
        if (mode === "sync")
          throw new Error("The feed changed during synchronization.");
        return;
      }
      setPage((current) =>
        mode !== "older"
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
      setError(null);
    } catch (error) {
      if (requestEpoch.current === epoch) setError(mode);
      if (mode === "sync") throw error;
    } finally {
      setBusy(false);
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
    <section
      className="feed-stream"
      aria-label={
        reviewOnly
          ? "Proofs needing your verdict"
          : memberId
            ? "Member posts"
            : "Circle timeline"
      }
    >
      <div className="feed-toolbar">
        <h2 className="text-xs font-medium text-muted-foreground">
          {reviewOnly
            ? "Waiting for your verdict"
            : memberId
              ? "Posts"
              : "Latest from your circle"}
        </h2>
      </div>
      {error && (
        <Alert variant="destructive" className="my-4">
          <AlertTitle>
            {error === "sync"
              ? "Updates interrupted"
              : "Could not load older posts"}
          </AlertTitle>
          <AlertDescription>
            {error === "sync"
              ? "Trying to reconnect automatically."
              : "Check your connection and try again."}
            <Button
              variant="link"
              disabled={busy}
              onClick={() =>
                error === "older"
                  ? void load("older")
                  : syncQueue.current?.request()
              }
            >
              Try again
            </Button>
          </AlertDescription>
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
                items:
                  reviewOnly &&
                  "canReview" in patch &&
                  patch.canReview === false
                    ? current.items.filter(
                        (item) => postKey(item) !== postKey(post),
                      )
                    : current.items.map((item) =>
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
            <EmptyTitle>
              {reviewOnly ? "No proof to review" : "No posts yet"}
            </EmptyTitle>
            <EmptyDescription>
              {reviewOnly
                ? "Check the feed for other posts."
                : memberId
                  ? "Their proof and check-ins will appear here."
                  : "Post some proof or check in."}
            </EmptyDescription>
          </EmptyHeader>
          {!memberId && !reviewOnly && (
            <Button onClick={() => openComposer()}>Create a post</Button>
          )}
        </Empty>
      )}
      <div ref={sentinel} aria-hidden="true" />
      {page.nextCursor ? (
        <Button
          variant="outline"
          className="my-6 self-center"
          disabled={busy}
          onClick={() => load("older")}
        >
          {busy && <Spinner data-icon="inline-start" />}Load older
        </Button>
      ) : (
        page.items.length > 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            That’s everything for now.
          </p>
        )
      )}
    </section>
  );
}
