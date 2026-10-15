"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { z } from "zod";
import { holdAppRefresh } from "@/lib/app-refresh";
import { messageRequest, messagesChanged } from "@/lib/direct-message-client";
import type { DirectMessageItem } from "@/lib/direct-message-types";
import { mediaIdsSchema } from "@/lib/media-policy";
import { uploadMedia } from "@/lib/media-upload";
import { MessageOutbox, type MessageSnapshot } from "@/lib/message-outbox";

const Context = createContext<MessageOutbox | null>(null);
const savedSchema = z.object({
  drafts: z.record(
    z.string(),
    z.object({
      body: z.string().max(4000),
      replyToId: z.string().max(64).optional(),
    }),
  ),
  outbox: z.array(
    z.object({
      clientId: z.string().uuid(),
      conversationId: z.string(),
      body: z.string().max(4000),
      createdAt: z.string(),
      mediaIds: mediaIdsSchema.optional(),
      replyToId: z.string().max(64).optional(),
    }),
  ),
});

export function MessageProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [outbox] = useState(() => {
    const key = `pb:messages:v1:${userId}`;
    let storageFailed = false;
    const persist = (snapshot: MessageSnapshot) => {
      if (!snapshot.ready) return;
      try {
        // Text and finalized uploads can recover after a reload. Local File objects
        // stay in memory across app navigation; beforeunload protects those bytes.
        sessionStorage.setItem(
          key,
          JSON.stringify({
            drafts: Object.fromEntries(
              Object.entries(snapshot.drafts).map(([id, draft]) => [
                id,
                { body: draft.body, replyToId: draft.replyToId },
              ]),
            ),
            outbox: snapshot.outbox
              .filter(
                (item) =>
                  item.state !== "sent" &&
                  (!item.files.length || item.mediaIds),
              )
              .map(
                ({
                  clientId,
                  conversationId,
                  body,
                  createdAt,
                  mediaIds,
                  replyToId,
                }) => ({
                  clientId,
                  conversationId,
                  body,
                  createdAt,
                  mediaIds,
                  replyToId,
                }),
              ),
          }),
        );
        storageFailed = false;
      } catch {
        storageFailed = true;
      }
    };
    const store = new MessageOutbox(
      async (item, progress, uploaded, signal) => {
        const release = holdAppRefresh();
        try {
          signal.throwIfAborted();
          const mediaIds =
            item.mediaIds ??
            (item.files.length
              ? await uploadMedia(item.files, progress, {
                  directConversationId: item.conversationId,
                  deferProcessing: true,
                })
              : []);
          uploaded(mediaIds);
          signal.throwIfAborted();
          const videos = mediaIds.filter((id) => id.startsWith("v_"));
          for (const id of videos) {
            signal.throwIfAborted();
            await messageRequest(`/api/media/${id}`, "POST", undefined, signal);
          }
          if (videos.length) {
            for (;;) {
              signal.throwIfAborted();
              const query = new URLSearchParams(
                mediaIds.map((id) => ["id", id]),
              );
              const result = await messageRequest<{
                media: {
                  ready: boolean;
                  progress: number;
                  processingError: string | null;
                }[];
              }>(`/api/media/status?${query}`, "GET", undefined, signal);
              if (result.media.length !== mediaIds.length)
                throw new Error(
                  "An attachment is no longer available. Choose it again.",
                );
              const failed = result.media.find(
                (media) => media.processingError,
              );
              if (failed)
                throw new Error(
                  failed.processingError ??
                    "Video processing failed. Try again.",
                );
              if (result.media.every((media) => media.ready)) break;
              progress(
                "Preparing your video…",
                Math.round(
                  result.media.reduce(
                    (sum, media) => sum + (media.ready ? 100 : media.progress),
                    0,
                  ) / mediaIds.length,
                ),
              );
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          }
          signal.throwIfAborted();
          const result = await messageRequest<{ message: DirectMessageItem }>(
            `/api/messages/${item.conversationId}`,
            "POST",
            {
              clientId: item.clientId,
              body: item.body,
              mediaIds,
              replyToId: item.replyToId ?? null,
            },
            signal,
          );
          return result.message;
        } finally {
          release();
        }
      },
      persist,
      messagesChanged,
    );
    return { store, key, storageFailed: () => storageFailed };
  });
  useEffect(() => {
    try {
      const parsed = savedSchema.safeParse(
        JSON.parse(sessionStorage.getItem(outbox.key) ?? "null"),
      );
      if (parsed.success)
        outbox.store.restore({
          drafts: Object.fromEntries(
            Object.entries(parsed.data.drafts).map(([id, draft]) => [
              id,
              { ...draft, files: [] },
            ]),
          ),
          outbox: parsed.data.outbox.map((item) => ({
            ...item,
            files: [],
            state: "failed",
            status: "Send interrupted. Retry to check delivery.",
            percent: null,
          })),
        });
    } catch {
      /* Storage can be unavailable in a private browsing session. */
    }
    outbox.store.restore();
    outbox.store.start();
    const warn = (event: BeforeUnloadEvent) => {
      const snapshot = outbox.store.getSnapshot();
      const hasFiles =
        Object.values(snapshot.drafts).some((draft) => draft.files.length) ||
        snapshot.outbox.some((item) => item.files.length && !item.mediaIds);
      const hasUnsent =
        Object.keys(snapshot.drafts).length ||
        snapshot.outbox.some((item) => item.state !== "sent");
      if (hasFiles || (outbox.storageFailed() && hasUnsent)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      outbox.store.stop();
      window.removeEventListener("beforeunload", warn);
    };
  }, [outbox]);
  return <Context value={outbox.store}>{children}</Context>;
}

export function useMessages() {
  const store = useContext(Context);
  if (!store) throw new Error("MessageProvider is missing.");
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return { store, ...snapshot };
}
