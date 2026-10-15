"use client";

import { ChevronLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { RealtimeStatus } from "@/components/layout/realtime-provider";
import { ConversationAvatar } from "@/components/messages/conversation-avatar";
import { DirectMessage } from "@/components/messages/direct-message";
import { MessageComposer } from "@/components/messages/message-composer";
import { useMessages } from "@/components/messages/message-provider";
import { PendingMessage } from "@/components/messages/pending-message";
import { usePeerTyping } from "@/components/messages/use-typing";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerVisibility,
} from "@/components/ui/message-scroller";
import { Skeleton } from "@/components/ui/skeleton";
import {
  messageRequest,
  messagesChanged,
  messagesChangedEvent,
} from "@/lib/direct-message-client";
import {
  conversationName,
  type DirectMessageItem,
  type DirectThread,
  mergeDirectMessages,
  messageReceipts,
  threadPlacements,
} from "@/lib/direct-message-types";
import { formatThreadDivider } from "@/lib/message-time";
import { cn } from "@/lib/utils";
import { watchRealtime } from "@/lib/watch-realtime";

type ThreadProps = {
  id: string;
  viewerId: string;
  now: Date;
  timeZone: string;
};

function ReadMessages({
  id,
  messages,
}: {
  id: string;
  messages: DirectMessageItem[];
}) {
  const { visibleMessageIds } = useMessageScrollerVisibility();
  const visible = new Set(visibleMessageIds);
  const through = Math.max(
    0,
    ...messages
      .filter((message) => visible.has(message.id))
      .map((message) => message.sequence),
  );
  const acknowledged = useRef(0);
  useEffect(() => {
    let alive = true;
    async function read() {
      if (
        through <= acknowledged.current ||
        document.visibilityState !== "visible" ||
        !document.hasFocus()
      )
        return;
      await messageRequest(`/api/messages/${id}`, "PATCH", { through });
      if (alive) {
        acknowledged.current = Math.max(acknowledged.current, through);
        messagesChanged();
      }
    }
    const live = watchRealtime(
      read,
      (event) => event.type === "messages" && event.conversationId === id,
    );
    return () => {
      alive = false;
      live.dispose();
    };
  }, [id, through]);
  return null;
}

function ThreadContents({ id, viewerId, now, timeZone }: ThreadProps) {
  const [thread, setThread] = useState<DirectThread | null>(null);
  const [error, setError] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const revision = useRef<number | null>(null);
  const live = useRef<ReturnType<typeof watchRealtime> | null>(null);
  const mounted = useRef(true);
  const typing = usePeerTyping(id, viewerId);
  const { store, outbox } = useMessages();
  const outgoing = outbox.filter((item) => item.conversationId === id);
  const messages = mergeDirectMessages(
    thread?.messages ?? [],
    outgoing.flatMap((item) => (item.message ? [item.message] : [])),
  );
  const confirmed = new Set(
    messages
      .filter((item) => item.senderId === viewerId)
      .map((item) => item.clientId),
  );
  const pending = outgoing.filter((item) => !confirmed.has(item.clientId));
  const receipts = messageReceipts(
    messages,
    viewerId,
    thread?.readThrough ?? 0,
    thread?.kind === "direct",
  );
  useEffect(() => {
    if (thread) store.acknowledge(id, thread.messages, viewerId);
  }, [thread, store, viewerId, id]);
  const { scrollToEnd, scrollToMessage } = useMessageScroller();
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const historyAnchor = useRef<{ id: string; top: number } | null>(null);
  useLayoutEffect(() => {
    const anchor = historyAnchor.current;
    if (!anchor || !viewport.current || !content.current || !thread) return;
    // Let the primitive finish its prepend anchoring before correcting the
    // date-heading offset. Otherwise its mutation observer undoes this jump.
    const frame = requestAnimationFrame(() => {
      const list = content.current;
      const scrollport = viewport.current;
      if (!list || !scrollport) return;
      const row = list.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(anchor.id)}"]`,
      );
      const bubble = row?.querySelector<HTMLElement>('[data-slot="message"]');
      if (!row || !bubble) return;
      const inset =
        bubble.getBoundingClientRect().top - row.getBoundingClientRect().top;
      const padding =
        Number.parseFloat(getComputedStyle(list).paddingBlockStart) || 0;
      scrollToMessage(anchor.id, {
        align: "start",
        behavior: "instant",
        scrollMargin:
          anchor.top - scrollport.getBoundingClientRect().top - inset - padding,
      });
      historyAnchor.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [thread, scrollToMessage]);
  const readThread = useCallback(async () => {
    try {
      let more = true;
      while (more && mounted.current) {
        const initial = revision.current === null;
        const result: DirectThread = await messageRequest(
          `/api/messages/${id}${initial ? "" : `?sinceRevision=${revision.current}`}`,
        );
        if (!mounted.current) return;
        revision.current = result.revision;
        setThread((current) =>
          current
            ? {
                ...current,
                ...(result.kind === "group"
                  ? { kind: result.kind, group: result.group, person: null }
                  : { kind: result.kind, person: result.person, group: null }),
                revision: result.revision,
                readThrough: Math.max(current.readThrough, result.readThrough),
                messages: mergeDirectMessages(
                  current.messages,
                  result.messages,
                  "updates",
                ),
              }
            : result,
        );
        setError("");
        more = result.moreChanges;
        if (!initial && result.messages.length) messagesChanged();
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Couldn't refresh messages. Retrying shortly.",
        );
      throw cause;
    }
  }, [id]);
  useEffect(() => {
    mounted.current = true;
    const watcher = watchRealtime(
      readThread,
      (event) =>
        (event.type === "messages" &&
          (!event.conversationId || event.conversationId === id)) ||
        event.type === "refresh",
      [messagesChangedEvent],
    );
    live.current = watcher;
    return () => {
      mounted.current = false;
      watcher.dispose();
    };
  }, [readThread, id]);
  const refresh = () => live.current?.request();
  function captureHistoryAnchor() {
    const top = viewport.current?.getBoundingClientRect().top ?? 0;
    const visible = Array.from(
      content.current?.querySelectorAll<HTMLElement>(
        '[data-slot="message-scroller-item"]',
      ) ?? [],
    ).find((row) => {
      const bubble = row.querySelector('[data-slot="message"]');
      return bubble && bubble.getBoundingClientRect().top >= top;
    });
    const bubble = visible?.querySelector('[data-slot="message"]');
    return visible?.dataset.messageId && bubble
      ? {
          id: visible.dataset.messageId,
          top: bubble.getBoundingClientRect().top,
        }
      : null;
  }
  async function older() {
    if (!thread || loadingOlder || !thread.messages.length) return;
    setLoadingOlder(true);
    try {
      const page = await messageRequest<DirectThread>(
        `/api/messages/${id}?before=${thread.messages[0]?.sequence}`,
      );
      if (mounted.current) {
        historyAnchor.current = captureHistoryAnchor();
        setThread((current) =>
          current
            ? {
                ...current,
                hasMore: page.hasMore,
                messages: mergeDirectMessages(current.messages, page.messages),
              }
            : current,
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't load older messages.",
      );
    } finally {
      setLoadingOlder(false);
    }
  }
  const update = (message: DirectMessageItem) =>
    setThread((current) =>
      current
        ? {
            ...current,
            messages: mergeDirectMessages(current.messages, [message]),
          }
        : current,
    );

  const name = thread ? conversationName(thread) : "";
  const group = thread?.kind === "group";
  const rows = [
    ...messages.map((message) => ({
      key: message.id,
      senderId: message.senderId,
      createdAt: message.createdAt,
      message,
      item: null,
    })),
    ...pending.map((item) => ({
      key: `pending-${item.clientId}`,
      senderId: viewerId,
      createdAt: item.createdAt,
      message: null,
      item,
    })),
  ];
  const placements = threadPlacements(rows, timeZone);

  return (
    <section
      className="dm-thread"
      data-kind={thread?.kind}
      aria-label={thread ? `Conversation with ${name}` : "Conversation"}
    >
      <header className="dm-thread-header">
        <Link
          href="/messages"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "dm-back",
          )}
          aria-label="Back to messages"
        >
          <ChevronLeft />
        </Link>
        {thread ? (
          <div className="dm-thread-peer">
            <ConversationAvatar chat={thread} className="dm-thread-avatar" />
            <div className="dm-thread-title">
              <h2 className="dm-thread-name">
                {thread.kind === "direct" ? (
                  <Link
                    href={`/members/${encodeURIComponent(thread.person.id)}`}
                    className="dm-thread-profile"
                    title={`View ${thread.person.name}'s profile`}
                  >
                    {name}
                  </Link>
                ) : (
                  name
                )}
              </h2>
              <output
                className="dm-thread-status"
                data-typing={typing || undefined}
                aria-live="polite"
              >
                {typing
                  ? thread.kind === "group"
                    ? "Someone is typing…"
                    : `${thread.person.name.split(" ")[0]} is typing…`
                  : thread.kind === "group"
                    ? "Group chat"
                    : ""}
              </output>
            </div>
          </div>
        ) : (
          <div className="dm-thread-peer" aria-hidden="true">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        )}
        <div className="dm-connection">
          <RealtimeStatus />
        </div>
      </header>
      {error && (
        <div className="dm-thread-error" role="alert">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            <RefreshCw data-icon="inline-start" />
            Retry
          </Button>
        </div>
      )}
      {!thread ? (
        <section
          className="dm-thread-loading"
          aria-busy="true"
          aria-label="Loading conversation"
        >
          <Skeleton className="h-10 w-48 rounded-2xl" />
          <Skeleton className="h-10 w-64 rounded-2xl" />
          <Skeleton className="ml-auto h-10 w-40 rounded-2xl" />
          <Skeleton className="h-10 w-56 rounded-2xl" />
          <Skeleton className="ml-auto h-16 w-72 rounded-2xl" />
        </section>
      ) : (
        <>
          <div className="dm-thread-scroll">
            <MessageScroller>
              {thread.hasMore && (
                <div className="dm-older">
                  <Button
                    variant="secondary"
                    size="xs"
                    disabled={loadingOlder}
                    onClick={() => void older()}
                  >
                    {loadingOlder ? "Loading…" : "Load older messages"}
                  </Button>
                </div>
              )}
              <MessageScrollerViewport
                ref={viewport}
                preserveScrollOnPrepend
                aria-label="Messages in this conversation"
              >
                <MessageScrollerContent
                  ref={content}
                  className="dm-message-list"
                >
                  {!thread.hasMore && (
                    <MessageScrollerItem
                      messageId="intro"
                      className="dm-intro-row [content-visibility:visible]"
                    >
                      <div className="dm-intro">
                        <ConversationAvatar
                          chat={thread}
                          className="dm-intro-avatar"
                        />
                        <p className="dm-intro-name">{name}</p>
                        <p className="dm-intro-text">
                          {thread.kind === "group"
                            ? "Everyone in your circle can read and reply here."
                            : `This is the start of your conversation with ${thread.person.name.split(" ")[0]}. Only you two can see it.`}
                        </p>
                      </div>
                    </MessageScrollerItem>
                  )}
                  {rows.map((row, index) => {
                    const placement = placements[index];
                    const divider =
                      placement.divider &&
                      formatThreadDivider(row.createdAt, now, timeZone);
                    return (
                      <MessageScrollerItem
                        key={row.key}
                        messageId={row.key}
                        className={cn(
                          "[content-visibility:visible]",
                          placement.first && "dm-run-start",
                        )}
                      >
                        {divider && (
                          <p className="dm-divider">
                            <span className="dm-divider-day">
                              {divider.day}
                            </span>{" "}
                            {divider.time}
                          </p>
                        )}
                        {row.message ? (
                          <DirectMessage
                            message={row.message}
                            conversationId={id}
                            viewerId={viewerId}
                            peerName={name}
                            group={group}
                            placement={placement}
                            timeZone={timeZone}
                            receipt={receipts.get(row.message.id)}
                            onUpdate={update}
                            refresh={() => void refresh()}
                          />
                        ) : (
                          row.item && (
                            <PendingMessage
                              item={row.item}
                              placement={placement}
                            />
                          )
                        )}
                      </MessageScrollerItem>
                    );
                  })}
                  {typing && (
                    <MessageScrollerItem
                      messageId="typing"
                      className="dm-run-start [content-visibility:visible]"
                    >
                      <div className="dm-typing" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </div>
                    </MessageScrollerItem>
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton aria-label="Jump to latest message" />
            </MessageScroller>
          </div>
          <ReadMessages id={id} messages={messages} />
          <MessageComposer
            id={id}
            name={name}
            group={group}
            onSend={() => {
              requestAnimationFrame(() => scrollToEnd({ behavior: "instant" }));
            }}
          />
        </>
      )}
    </section>
  );
}

export function MessageThread(props: ThreadProps) {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <ThreadContents {...props} />
    </MessageScrollerProvider>
  );
}
