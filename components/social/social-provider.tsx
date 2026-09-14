"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  lazy,
  type ReactNode,
  Suspense,
  use,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { PendingMediaPosts } from "@/components/media/pending-media-posts";
import type {
  ComposerDraft,
  ComposerRequest,
} from "@/components/social/social-composer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useStoryViews } from "@/hooks/use-story-views";
import type {
  FeedPage,
  FeedPost,
  SocialAuthor,
  SocialTask,
  StoryGroup,
} from "@/lib/social-types";
import { postKey } from "@/lib/social-types";
import { expireStoryGroups, orderStoryGroups } from "@/lib/stories";

const SocialComposer = lazy(() =>
  import("@/components/social/social-composer").then((module) => ({
    default: module.SocialComposer,
  })),
);
const StoryViewer = lazy(() =>
  import("@/components/social/story-viewer").then((module) => ({
    default: module.StoryViewer,
  })),
);

function OverlayLoading({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent finalFocus={false}>
        <DialogHeader>
          <DialogTitle>Opening…</DialogTitle>
        </DialogHeader>
        <output className="flex items-center gap-2 py-6">
          <Spinner />
          Loading
        </output>
      </DialogContent>
    </Dialog>
  );
}

function StorySync({
  initial,
  onSync,
}: {
  initial: Promise<StoryGroup[] | null>;
  onSync: (groups: StoryGroup[] | null) => void;
}) {
  const groups = use(initial);
  useEffect(() => onSync(groups), [groups, onSync]);
  return null;
}

type SocialContext = {
  viewer: SocialAuthor;
  circleId: string;
  day: string;
  tasks: SocialTask[];
  stories: StoryGroup[];
  storiesReady: boolean;
  storiesError: boolean;
  reloadStories: () => Promise<void>;
  postRevision: number;
  feedLayouts: Map<string, "grid" | "list">;
  openStories: (authorId: string, trigger?: HTMLElement) => void;
  openComposer: (request?: ComposerRequest) => void;
  feeds: Map<string, FeedPage & { serverSignature: string }>;
  scrolls: Map<string, number>;
  patchPost: (
    post: Pick<FeedPost, "kind" | "id">,
    patch: Partial<FeedPost>,
  ) => void;
};
const Context = createContext<SocialContext | null>(null);

export function SocialProvider({
  viewer,
  circleId,
  day,
  tasks,
  initialStories,
  children,
}: {
  viewer: SocialAuthor;
  circleId: string;
  day: string;
  tasks: SocialTask[];
  initialStories: Promise<StoryGroup[] | null>;
  children: ReactNode;
}) {
  const routeKey = `${usePathname()}?${useSearchParams().toString()}`;
  const [composer, setComposer] = useState<ComposerRequest | null>(null);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [storiesReady, setStoriesReady] = useState(false);
  const [storiesError, setStoriesError] = useState(false);
  const reloadingStories = useRef(false);
  const [postRevision, setPostRevision] = useState(0);
  const [storySession, setStorySession] = useState<{
    groups: StoryGroup[];
    authorId: string;
    routeKey: string;
    trigger?: HTMLElement;
  } | null>(null);
  const { markViewed, mergeViews } = useStoryViews(
    viewer.id,
    circleId,
    setStories,
  );
  useEffect(() => {
    setStorySession((current) =>
      current && current.routeKey !== routeKey ? null : current,
    );
  }, [routeKey]);
  const syncStories = useCallback(
    (fresh: StoryGroup[] | null) => {
      setStoriesReady(true);
      setStoriesError(!fresh);
      if (!fresh) {
        toast.add({
          title: "Stories could not load.",
          type: "error",
        });
        return;
      }
      const local = mergeViews(fresh);
      setStories((current) => {
        const seen = new Map(
          current.flatMap((group) =>
            group.posts.map(
              (item) => [postKey(item.post), item.seenFrames] as const,
            ),
          ),
        );
        return local.map((group) => ({
          ...group,
          posts: group.posts.map((item) => ({
            ...item,
            seenFrames: [
              ...new Set([
                ...item.seenFrames,
                ...(seen.get(postKey(item.post)) ?? []),
              ]),
            ],
          })),
        }));
      });
    },
    [mergeViews],
  );
  const reloadStories = useCallback(async () => {
    if (reloadingStories.current) return;
    reloadingStories.current = true;
    setStoriesReady(false);
    try {
      const response = await fetch("/api/stories", {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("Could not load stories");
      syncStories(await response.json());
    } catch {
      syncStories(null);
    } finally {
      reloadingStories.current = false;
    }
  }, [syncStories]);
  useEffect(() => {
    const expire = () => setStories((current) => expireStoryGroups(current));
    const timer = window.setInterval(expire, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const drafts = useRef(new Map<string, ComposerDraft>());
  const draftKey = `${day}:${composer?.mode}:${composer?.task?.id ?? "new"}`;
  const feeds = useRef(
    new Map<string, FeedPage & { serverSignature: string }>(),
  );
  const scrolls = useRef(new Map<string, number>());
  const feedLayouts = useRef(new Map<string, "grid" | "list">());
  const patchPost = useCallback(
    (post: Pick<FeedPost, "kind" | "id">, patch: Partial<FeedPost>) => {
      for (const [key, page] of feeds.current) {
        feeds.current.set(key, {
          ...page,
          items: page.items
            .map((item) =>
              postKey(item) === postKey(post)
                ? ({ ...item, ...patch } as FeedPost)
                : item,
            )
            .filter(
              (item) =>
                key !== "!review" || (item.kind === "proof" && item.canReview),
            ),
        });
      }
      setStories((groups) =>
        groups.map((group) => ({
          ...group,
          posts: group.posts.map((item) =>
            postKey(item.post) === postKey(post)
              ? { ...item, post: { ...item.post, ...patch } as FeedPost }
              : item,
          ),
        })),
      );
      setPostRevision((value) => value + 1);
    },
    [],
  );
  return (
    <Context
      value={{
        viewer,
        circleId,
        day,
        tasks,
        stories: orderStoryGroups(stories, viewer.id),
        storiesReady,
        storiesError,
        reloadStories,
        postRevision,
        feedLayouts: feedLayouts.current,
        openStories: (authorId, trigger) => {
          const groups = orderStoryGroups(
            expireStoryGroups(stories),
            viewer.id,
          );
          if (groups.some((group) => group.author.id === authorId))
            setStorySession({ groups, authorId, trigger, routeKey });
          else if (authorId === viewer.id)
            setComposer({ mode: "story", source: "story" });
          else
            toast.add({
              title:
                "That story has expired. The post is still on their profile.",
              type: "info",
            });
        },
        feeds: feeds.current,
        scrolls: scrolls.current,
        patchPost,
        openComposer: (request = { mode: "choose" }) => setComposer(request),
      }}
    >
      <Suspense fallback={null}>
        <StorySync initial={initialStories} onSync={syncStories} />
      </Suspense>
      <PendingMediaPosts key={circleId} circleId={circleId} />
      {children}
      {storySession && storySession.routeKey === routeKey && (
        <Suspense
          fallback={<OverlayLoading onClose={() => setStorySession(null)} />}
        >
          <StoryViewer
            groups={storySession.groups}
            authorId={storySession.authorId}
            returnFocus={storySession.trigger}
            onViewed={markViewed}
            onClose={() => setStorySession(null)}
          />
        </Suspense>
      )}
      {composer && (
        <Suspense
          fallback={<OverlayLoading onClose={() => setComposer(null)} />}
        >
          <SocialComposer
            draftKey={draftKey}
            request={composer}
            draft={drafts.current.get(draftKey)}
            onSaveDraft={(draft) => drafts.current.set(draftKey, draft)}
            onDiscardDraft={() => drafts.current.delete(draftKey)}
            onRequestChange={setComposer}
            tasks={tasks}
            circleId={circleId}
            day={day}
            onClose={() => setComposer(null)}
          />
        </Suspense>
      )}
    </Context>
  );
}

export function useSocial() {
  const value = useContext(Context);
  if (!value) throw new Error("Social components need SocialProvider.");
  return value;
}
