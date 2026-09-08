"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import {
  type ComposerDraft,
  type ComposerRequest,
  SocialComposer,
} from "@/components/social/social-composer";
import type {
  FeedPage,
  FeedPost,
  SocialAuthor,
  SocialTask,
} from "@/lib/social-types";
import { postKey } from "@/lib/social-types";

type SocialContext = {
  viewer: SocialAuthor;
  circleId: string;
  day: string;
  tasks: SocialTask[];
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
                key !== "!review" || (item.kind === "proof" && item.canReview),
            ),
        });
      }
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
        feeds: feeds.current,
        scrolls: scrolls.current,
        patchPost,
        openComposer: (request = { mode: "choose" }) => setComposer(request),
      }}
    >
      {children}
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
