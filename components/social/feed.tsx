"use client";

import { Camera, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { requestAppRefresh } from "@/lib/app-refresh";
import { reconcileFeed, refreshFeedPages } from "@/lib/feed-state";
import { type FeedPage, type FeedPost, postKey } from "@/lib/social-types";

export function Feed({
  initial,
  memberId,
  reviewOnly = false,
}: {
  initial: FeedPage;
  memberId?: string;
  reviewOnly?: boolean;
}) {
  const { feeds, openComposer } = useSocial();
  const key = reviewOnly ? "!review" : (memberId ?? "home");
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
  const start = useRef<{ x: number; y: number } | null>(null);
  const pull = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const requestEpoch = useRef(0);
  useEffect(() => {
    if (previousSignature.current !== signature) {
      previousSignature.current = signature;
      requestEpoch.current += 1;
      setPage((current) => reconcileFeed(current, initial));
    }
  }, [initial, signature]);
  useEffect(() => {
    feeds.set(key, { ...page, serverSignature: previousSignature.current });
  }, [page, feeds, key]);
  useEffect(
    () => () => {
      requestEpoch.current += 1;
    },
    [],
  );

  async function load(mode: "refresh" | "older") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(mode);
    setError(null);
    const epoch = ++requestEpoch.current;
    try {
      async function readPage(cursor?: string): Promise<FeedPage> {
        const query = new URLSearchParams();
        if (memberId) query.set("memberId", memberId);
        if (reviewOnly) query.set("filter", "review");
        if (cursor) query.set("cursor", cursor);
        const response = await fetch(`/api/feed?${query}`, {
          cache: "no-store",
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

  return (
    <section
      className="flex flex-col"
      aria-label={memberId ? "Member posts" : "Circle feed"}
      onTouchStart={(event) => {
        const scroll = event.currentTarget.closest(
          '[data-slot="social-scroll"]',
        );
        const touch = event.touches[0];
        start.current =
          scroll?.scrollTop === 0 && event.touches.length === 1
            ? { x: touch.clientX, y: touch.clientY }
            : null;
        pull.current = 0;
      }}
      onTouchMove={(event) => {
        if (!start.current) return;
        const dx = Math.abs(event.touches[0].clientX - start.current.x);
        const dy = event.touches[0].clientY - start.current.y;
        if (dx > 25 || dy < 0) {
          start.current = null;
          pull.current = 0;
          setPullDistance(0);
          return;
        }
        pull.current = Math.min(100, dy);
        setPullDistance(pull.current);
      }}
      onTouchEnd={() => {
        if (pull.current >= 80) void load("refresh");
        start.current = null;
        pull.current = 0;
        setPullDistance(0);
      }}
      onTouchCancel={() => {
        start.current = null;
        pull.current = 0;
        setPullDistance(0);
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">
          {reviewOnly
            ? "Waiting for your verdict"
            : memberId
              ? "Posts"
              : "Around your circle"}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Refresh posts"
          disabled={busy !== null}
          onClick={() => load("refresh")}
        >
          {busy === "refresh" ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          Refresh
        </Button>
      </div>
      {pullDistance > 15 && (
        <output className="py-3 text-center text-xs text-muted-foreground">
          {pullDistance >= 80 ? "Release to refresh" : "Pull to refresh"}
        </output>
      )}
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
              {reviewOnly ? "You’re all caught up" : "Good things start here"}
            </EmptyTitle>
            <EmptyDescription>
              {reviewOnly
                ? "No proof needs your verdict. Thanks for showing up for your friends."
                : memberId
                  ? "Their proof and check-ins will appear here."
                  : "Post some proof or check in. Your circle is built by showing up."}
            </EmptyDescription>
          </EmptyHeader>
          {!memberId && !reviewOnly && (
            <Button onClick={() => openComposer()}>Make the first move</Button>
          )}
        </Empty>
      )}
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
  );
}
