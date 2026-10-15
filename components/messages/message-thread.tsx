"use client";

import { ArrowLeft, MessageCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DirectMessage } from "@/components/messages/direct-message";
import {
  MessageComposer,
  type MessageDrafts,
} from "@/components/messages/message-composer";
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
import { messageRequest, messagesChanged } from "@/lib/direct-message-client";
import {
  type DirectMessageItem,
  type DirectThread,
  mergeDirectMessages,
} from "@/lib/direct-message-types";
import { cn } from "@/lib/utils";

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
    let pending = false;
    async function read() {
      if (
        pending ||
        through <= acknowledged.current ||
        document.visibilityState !== "visible" ||
        !document.hasFocus()
      )
        return;
      pending = true;
      try {
        await messageRequest(`/api/messages/${id}`, "PATCH", { through });
        if (alive) {
          acknowledged.current = Math.max(acknowledged.current, through);
          messagesChanged();
        }
      } catch {
        /* Retry on the next visibility change or tick. */
      } finally {
        pending = false;
      }
    }
    void read();
    const timer = setInterval(read, 5000);
    document.addEventListener("visibilitychange", read);
    window.addEventListener("focus", read);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
      window.removeEventListener("focus", read);
    };
  }, [id, through]);
  return null;
}

function ThreadContents({
  id,
  viewerId,
  drafts,
}: {
  id: string;
  viewerId: string;
  drafts: MessageDrafts;
}) {
  const [thread, setThread] = useState<DirectThread | null>(null);
  const [error, setError] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const revision = useRef<number | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const { scrollToEnd } = useMessageScroller();
  const refresh = useCallback(async () => {
    if (pending.current || document.visibilityState === "hidden") return;
    pending.current = true;
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
                revision: result.revision,
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
    } finally {
      pending.current = false;
    }
  }, [id]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(refresh, 4000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [refresh]);
  async function older() {
    if (!thread || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await messageRequest<DirectThread>(
        `/api/messages/${id}?before=${thread.messages[0]?.sequence}`,
      );
      if (mounted.current)
        setThread((current) =>
          current
            ? {
                ...current,
                hasMore: page.hasMore,
                messages: mergeDirectMessages(current.messages, page.messages),
              }
            : current,
        );
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
        thread ? `Conversation with ${thread.person.name}` : "Conversation"
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
              <AvatarImage src={thread.person.image ?? undefined} alt="" />
              <AvatarFallback>{thread.person.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="truncate font-semibold">{thread.person.name}</h2>
              <p className="text-xs text-muted-foreground">Direct message</p>
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
              <MessageScrollerViewport
                preserveScrollOnPrepend
                aria-label="Messages in this conversation"
              >
                <MessageScrollerContent className="dm-message-list">
                  {thread.hasMore && (
                    <MessageScrollerItem messageId="older">
                      <div className="flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={loadingOlder}
                          onClick={() => void older()}
                        >
                          {loadingOlder ? "Loading…" : "Load older messages"}
                        </Button>
                      </div>
                    </MessageScrollerItem>
                  )}
                  {!thread.messages.length && (
                    <MessageScrollerItem messageId="intro">
                      <Empty className="dm-thread-empty">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <MessageCircle />
                          </EmptyMedia>
                          <EmptyTitle>
                            Say hey to {thread.person.name.split(" ")[0]}
                          </EmptyTitle>
                          <EmptyDescription>
                            A little less group chat energy. Send a message, a
                            photo, or something worth reacting to.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </MessageScrollerItem>
                  )}
                  {thread.messages.map((message, index) => {
                    const date = new Date(message.createdAt).toLocaleDateString(
                      [],
                      {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      },
                    );
                    const previous = thread.messages[index - 1];
                    const newDay =
                      !previous ||
                      new Date(previous.createdAt).toDateString() !==
                        new Date(message.createdAt).toDateString();
                    return (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
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
                          peerName={thread.person.name}
                          onUpdate={update}
                          refresh={() => void refresh()}
                        />
                      </MessageScrollerItem>
                    );
                  })}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton aria-label="Jump to latest message" />
            </MessageScroller>
          </div>
          <ReadMessages id={id} messages={thread.messages} />
          <MessageComposer
            id={id}
            name={thread.person.name}
            drafts={drafts}
            onSent={(message) => {
              update(message);
              requestAnimationFrame(() => scrollToEnd({ behavior: "instant" }));
            }}
          />
        </>
      )}
    </section>
  );
}

export function MessageThread(props: {
  id: string;
  viewerId: string;
  drafts: MessageDrafts;
}) {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <ThreadContents {...props} />
    </MessageScrollerProvider>
  );
}
