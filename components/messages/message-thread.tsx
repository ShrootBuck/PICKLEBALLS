"use client";

import { ArrowLeft, MessageCircle, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { RealtimeStatus } from "@/components/layout/realtime-provider";
import { DirectMessage } from "@/components/messages/direct-message";
import { MessageComposer } from "@/components/messages/message-composer";
import { useMessages } from "@/components/messages/message-provider";
import { PendingMessage } from "@/components/messages/pending-message";
import { usePeerTyping } from "@/components/messages/use-typing";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Marker, MarkerContent } from "@/components/ui/marker";
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
} from "@/lib/direct-message-types";
import { cn } from "@/lib/utils";
import { watchRealtime } from "@/lib/watch-realtime";

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

function ThreadContents({ id, viewerId }: { id: string; viewerId: string }) {
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

  return (
    <section
      className="dm-thread"
      aria-label={
        thread
          ? `Conversation with ${conversationName(thread)}`
          : "Conversation"
      }
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
          <ArrowLeft />
        </Link>
        {thread ? (
          <>
            <Avatar>
              <AvatarImage
                userId={thread.person?.id}
                src={thread.person?.image ?? undefined}
                alt=""
              />
              <AvatarFallback>
                {thread.kind === "group" ? (
                  <Users className="size-5" />
                ) : (
                  thread.person.initials
                )}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="truncate font-semibold">
                {conversationName(thread)}
              </h2>
              <output
                className="text-xs text-muted-foreground"
                aria-live="polite"
              >
                {typing
                  ? thread.kind === "group"
                    ? "Someone is typing…"
                    : `${thread.person.name.split(" ")[0]} is typing…`
                  : thread.kind === "group"
                    ? "Circle group chat"
                    : "Direct message"}
              </output>
            </div>
            <div className="ml-auto">
              <RealtimeStatus />
            </div>
          </>
        ) : (
          <Skeleton className="h-10 w-44" />
        )}
      </header>
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-2">
            {error}
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              <RefreshCw data-icon="inline-start" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!thread ? (
        <section
          className="flex flex-col gap-6 p-6"
          aria-busy="true"
          aria-label="Loading conversation"
        >
          <Skeleton className="h-14 w-2/3" />
          <Skeleton className="ml-auto h-14 w-1/2" />
          <Skeleton className="h-14 w-1/2" />
        </section>
      ) : (
        <>
          <div className="dm-thread-scroll">
            <MessageScroller>
              {thread.hasMore && (
                <div className="flex shrink-0 justify-center py-1">
                  <Button
                    variant="ghost"
                    size="sm"
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
                  {!messages.length && !pending.length && (
                    <MessageScrollerItem messageId="intro">
                      <Empty className="dm-thread-empty">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <MessageCircle />
                          </EmptyMedia>
                          <EmptyTitle>
                            {thread.kind === "group"
                              ? "The whole circle is here"
                              : `Say hey to ${thread.person.name.split(" ")[0]}`}
                          </EmptyTitle>
                          <EmptyDescription>
                            {thread.kind === "group"
                              ? "Share a message, photo, or video with everyone in your circle."
                              : "Send a message, a photo, or something worth reacting to."}
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </MessageScrollerItem>
                  )}
                  {messages.map((message, index) => {
                    const date = new Date(message.createdAt).toLocaleDateString(
                      [],
                      {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      },
                    );
                    const previous = messages[index - 1];
                    const newDay =
                      !previous ||
                      new Date(previous.createdAt).toDateString() !==
                        new Date(message.createdAt).toDateString();
                    return (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                        className="[content-visibility:visible]"
                      >
                        {newDay && (
                          <Marker variant="separator" className="dm-date">
                            <MarkerContent>{date}</MarkerContent>
                          </Marker>
                        )}
                        <DirectMessage
                          message={message}
                          conversationId={id}
                          viewerId={viewerId}
                          peerName={conversationName(thread)}
                          group={thread.kind === "group"}
                          receipt={receipts.get(message.id)}
                          onUpdate={update}
                          refresh={() => void refresh()}
                        />
                      </MessageScrollerItem>
                    );
                  })}
                  {pending.map((item) => (
                    <MessageScrollerItem
                      key={item.clientId}
                      messageId={`pending-${item.clientId}`}
                      className="[content-visibility:visible]"
                    >
                      <PendingMessage item={item} />
                    </MessageScrollerItem>
                  ))}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton aria-label="Jump to latest message" />
            </MessageScroller>
          </div>
          <ReadMessages id={id} messages={messages} />
          <MessageComposer
            id={id}
            name={conversationName(thread)}
            group={thread.kind === "group"}
            onSend={() => {
              requestAnimationFrame(() => scrollToEnd({ behavior: "instant" }));
            }}
          />
        </>
      )}
    </section>
  );
}

export function MessageThread(props: { id: string; viewerId: string }) {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <ThreadContents {...props} />
    </MessageScrollerProvider>
  );
}
