"use client";

import { CircleAlert, MessagesSquare, Search, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ConversationAvatar } from "@/components/messages/conversation-avatar";
import { useMessages } from "@/components/messages/message-provider";
import { MessageThread } from "@/components/messages/message-thread";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  messageRequest,
  messagesChangedEvent,
} from "@/lib/direct-message-client";
import {
  conversationName,
  type DirectInboxItem,
  messagePreview,
} from "@/lib/direct-message-types";
import {
  formatConversationTime,
  formatMessageTimestamp,
} from "@/lib/message-time";
import { appTimeZone } from "@/lib/time";
import { cn } from "@/lib/utils";
import { watchRealtime } from "@/lib/watch-realtime";

export function MessagesInbox({
  viewerId,
  initialInbox,
  initialNow,
}: {
  viewerId: string;
  initialInbox: DirectInboxItem[];
  initialNow: string;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const requested = search.get("chat");
  const to = search.get("to");
  const [inbox, setInbox] = useState(initialInbox);
  const { drafts, outbox } = useMessages();
  const selected = inbox.find((chat) => chat.id === requested)?.id;
  const [query, setQuery] = useState("");
  const [refreshError, setRefreshError] = useState(false);
  const [clock, setClock] = useState({
    now: new Date(initialNow),
    timeZone: appTimeZone,
  });
  useEffect(() => {
    const update = () =>
      setClock({
        now: new Date(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    update();
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  // Profile links select a conversation that is already in the directory.
  useEffect(() => {
    if (!to) return;
    const chat = inbox.find((item) => item.person?.id === to);
    if (chat)
      router.replace(`/messages?chat=${encodeURIComponent(chat.id)}`, {
        scroll: false,
      });
  }, [to, inbox, router]);
  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const result = await messageRequest<{
          conversations: DirectInboxItem[];
        }>(
          requested
            ? `/api/messages?${new URLSearchParams({ chat: requested })}`
            : "/api/messages",
        );
        if (alive) {
          setInbox(result.conversations);
          setRefreshError(false);
        }
      } catch (cause) {
        if (alive) setRefreshError(true);
        throw cause;
      }
    }
    const live = watchRealtime(
      refresh,
      (event) => event.type === "messages" || event.type === "refresh",
      [messagesChangedEvent],
    );
    return () => {
      alive = false;
      live.dispose();
    };
  }, [requested]);
  const conversations = inbox.filter(
    (item) =>
      item.kind === "group" ||
      item.person.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const groupChat = inbox.find((item) => item.kind === "group");

  function preview(item: DirectInboxItem) {
    const pending = outbox.filter(
      (message) =>
        message.conversationId === item.id && message.state !== "sent",
    );
    const draft = drafts[item.id];
    if (pending.some((message) => message.state === "failed"))
      return (
        <span className="dm-preview-alert">
          <CircleAlert aria-hidden="true" />
          Not sent. Open to retry.
        </span>
      );
    if (pending.length)
      return `Sending: ${pending.at(-1)?.body || "Attachment"}`;
    if (draft)
      return (
        <>
          <span className="dm-preview-draft">Draft:</span>{" "}
          {draft.body || "Attachment"}
        </>
      );
    const message = item.lastMessage;
    const author =
      message?.senderId === viewerId
        ? "You: "
        : item.kind === "group" && message?.sender
          ? `${message.sender.name.split(" ")[0]}: `
          : "";
    return `${author}${messagePreview(message)}`;
  }

  function conversation(item: DirectInboxItem) {
    const current = selected === item.id;
    return (
      <Link
        key={item.id}
        href={`/messages?chat=${encodeURIComponent(item.id)}`}
        scroll={false}
        className={cn("dm-conversation", current && "is-selected")}
        data-unread={item.unread > 0 || undefined}
        aria-current={current ? "page" : undefined}
      >
        <ConversationAvatar chat={item} className="dm-conversation-avatar" />
        <div className="dm-conversation-body">
          <div className="dm-conversation-line">
            <span className="dm-conversation-name font-semibold">
              {conversationName(item)}
            </span>
            {item.lastMessage && (
              <time
                className="dm-preview-time"
                dateTime={item.lastMessage.createdAt}
                title={formatMessageTimestamp(
                  item.lastMessage.createdAt,
                  clock.timeZone,
                )}
              >
                {formatConversationTime(
                  item.lastMessage.createdAt,
                  clock.now,
                  clock.timeZone,
                )}
              </time>
            )}
          </div>
          <div className="dm-conversation-line">
            <p className="dm-preview">{preview(item)}</p>
            {item.unread > 0 && (
              <Badge
                className="dm-unread"
                aria-label={`${item.unread} unread messages`}
              >
                {item.unread > 99 ? "99+" : item.unread}
              </Badge>
            )}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="dm-workspace" data-conversation={Boolean(selected)}>
      <aside className="dm-inbox" aria-label="Conversations">
        <header className="dm-inbox-header">
          <h1 className="dm-title">
            Messages<span className="text-primary">.</span>
          </h1>
        </header>
        <div className="dm-search">
          <Search aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people"
            aria-label="Search conversations"
            autoComplete="off"
          />
        </div>
        {refreshError && (
          <output className="dm-inbox-notice">
            Reconnecting to your inbox…
          </output>
        )}
        <nav className="dm-conversations" aria-label="Conversations">
          {conversations.map(conversation)}
          {!conversations.some((item) => item.kind === "direct") && (
            <div className="dm-inbox-empty">
              <p className="font-medium text-foreground">
                {query ? "No one by that name" : "No one else here yet"}
              </p>
              <p>
                {query
                  ? "Try a different name."
                  : "Members show up here when they join your circle."}
              </p>
            </div>
          )}
        </nav>
      </aside>
      {selected ? (
        <MessageThread
          key={selected}
          id={selected}
          viewerId={viewerId}
          now={clock.now}
          timeZone={clock.timeZone}
        />
      ) : (
        <div className="dm-idle">
          <div className="dm-idle-icon" aria-hidden="true">
            <MessagesSquare />
          </div>
          <h2 className="dm-idle-title">Pick a conversation</h2>
          <p className="dm-idle-text">
            Message someone one-on-one, or catch up with everyone in the group
            chat.
          </p>
          {groupChat && (
            <Link
              href={`/messages?chat=${encodeURIComponent(groupChat.id)}`}
              scroll={false}
              className={buttonVariants({ variant: "secondary" })}
            >
              <Users data-icon="inline-start" />
              Open group chat
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
