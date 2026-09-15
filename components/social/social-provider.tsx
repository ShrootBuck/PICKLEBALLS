"use client";

import {
  createContext,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
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
import type {
  FeedPage,
  FeedPost,
  SocialAuthor,
  SocialTask,
} from "@/lib/social-types";
import { postKey } from "@/lib/social-types";

const SocialComposer = lazy(() =>
  import("@/components/social/social-composer").then((module) => ({
    default: module.SocialComposer,
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

type SocialContext = {
  viewer: SocialAuthor;
  circleId: string;
  day: string;
  tasks: SocialTask[];
  postRevision: number;
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
  children,
}: {
  viewer: SocialAuthor;
  circleId: string;
  day: string;
  tasks: SocialTask[];
  children: ReactNode;
}) {
  const [composer, setComposer] = useState<ComposerRequest | null>(null);
  const [postRevision, setPostRevision] = useState(0);
  const drafts = useRef(new Map<string, ComposerDraft>());
  const draftKey = `${day}:${composer?.mode}:${composer?.task?.id ?? "new"}`;
  const feeds = useRef(
    new Map<string, FeedPage & { serverSignature: string }>(),
  );
  const scrolls = useRef(new Map<string, number>());
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
                (key !== "!review" ||
                  (item.kind === "proof" && item.canReview)) &&
                (key !== "!pending" ||
                  (item.kind === "proof" && item.canReview)) &&
                (key !== "!timeline" ||
                  item.kind !== "proof" ||
                  !item.canReview),
            ),
        });
      }
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
        postRevision,
        feeds: feeds.current,
        scrolls: scrolls.current,
        patchPost,
        openComposer: (request = { mode: "choose" }) => setComposer(request),
      }}
    >
      <PendingMediaPosts key={circleId} circleId={circleId} />
      {children}
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
