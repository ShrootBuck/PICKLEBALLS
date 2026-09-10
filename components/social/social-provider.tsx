"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { PendingMediaPosts } from "@/components/media/pending-media-posts";
import {
  type ComposerDraft,
  type ComposerRequest,
  SocialComposer,
} from "@/components/social/social-composer";
import { StoryViewer } from "@/components/social/story-viewer";
import { toast } from "@/components/ui/toast";
import type {
  FeedPage,
  FeedPost,
  SocialAuthor,
  SocialTask,
  StoryFrame,
  StoryGroup,
} from "@/lib/social-types";
import { postKey } from "@/lib/social-types";
import { orderStoryGroups, STORY_WINDOW_MS } from "@/lib/stories";

type SocialContext = {
  viewer: SocialAuthor;
  circleId: string;
  day: string;
  tasks: SocialTask[];
  stories: StoryGroup[];
  storiesReady: boolean;
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
  initialStories: StoryGroup[];
  children: ReactNode;
}) {
  const routeKey = `${usePathname()}?${useSearchParams().toString()}`;
  const [composer, setComposer] = useState<ComposerRequest | null>(null);
  const [stories, setStories] = useState(initialStories);
  const [storiesReady, setStoriesReady] = useState(false);
  useEffect(() => setStoriesReady(true), []);
  const [postRevision, setPostRevision] = useState(0);
  const [storySession, setStorySession] = useState<{
    groups: StoryGroup[];
    authorId: string;
    routeKey: string;
    trigger?: HTMLElement;
  } | null>(null);
  const seenRequests = useRef(new Set<string>());
  const viewErrorShown = useRef(false);
  useEffect(() => {
    setStorySession((current) =>
      current && current.routeKey !== routeKey ? null : current,
    );
  }, [routeKey]);
  useEffect(
    () =>
      setStories((current) =>
        initialStories.map((group) => ({
          ...group,
          posts: group.posts.map((item) => ({
            ...item,
            seenFrames: [
              ...new Set([
                ...item.seenFrames,
                ...(current
                  .find((old) => old.author.id === group.author.id)
                  ?.posts.find(
                    (old) => postKey(old.post) === postKey(item.post),
                  )?.seenFrames ?? []),
              ]),
            ],
          })),
        })),
      ),
    [initialStories],
  );
  useEffect(() => {
    const expire = () =>
      setStories((current) =>
        current
          .map((group) => ({
            ...group,
            posts: group.posts.filter(
              ({ post }) =>
                Date.now() - new Date(post.createdAt).getTime() <
                STORY_WINDOW_MS,
            ),
          }))
          .filter((group) => group.posts.length),
      );
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
  const markViewed = useCallback(
    async (frame: StoryFrame) => {
      if (frame.seen || seenRequests.current.has(frame.key)) return;
      seenRequests.current.add(frame.key);
      try {
        // Read receipts should not refresh the whole app after every frame.
        const response = await fetch("/api/stories", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            circleId,
            kind: frame.post.kind,
            id: frame.post.id,
            frame: frame.frame,
          }),
          keepalive: true,
        });
        if (!response.ok) throw new Error("View failed");
        setStories((groups) =>
          groups.map((group) => ({
            ...group,
            posts: group.posts.map((item) =>
              postKey(item.post) === postKey(frame.post)
                ? {
                    ...item,
                    seenFrames: [...new Set([...item.seenFrames, frame.frame])],
                  }
                : item,
            ),
          })),
        );
      } catch {
        seenRequests.current.delete(frame.key);
        if (!viewErrorShown.current) {
          viewErrorShown.current = true;
          toast.add({
            title:
              "Could not save your place in stories. You can keep watching.",
            type: "error",
          });
        }
      }
    },
    [circleId],
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
        postRevision,
        feedLayouts: feedLayouts.current,
        openStories: (authorId, trigger) => {
          const groups = orderStoryGroups(
            stories.map((group) => ({
              ...group,
              posts: group.posts.filter(
                ({ post }) =>
                  Date.now() - new Date(post.createdAt).getTime() <
                  STORY_WINDOW_MS,
              ),
            })),
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
      <PendingMediaPosts key={circleId} circleId={circleId} />
      {children}
      {storySession && storySession.routeKey === routeKey && (
        <StoryViewer
          groups={storySession.groups}
          authorId={storySession.authorId}
          returnFocus={storySession.trigger}
          onViewed={markViewed}
          onClose={() => setStorySession(null)}
        />
      )}
      {composer && (
        <SocialComposer
          key={draftKey}
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
      )}
    </Context>
  );
}

export function useSocial() {
  const value = useContext(Context);
  if (!value) throw new Error("Social components need SocialProvider.");
  return value;
}
