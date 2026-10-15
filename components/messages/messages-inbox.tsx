"use client";

import { MessageCircle, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MessageDraft } from "@/components/messages/message-composer";
import { MessageThread } from "@/components/messages/message-thread";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { cn } from "@/lib/utils";
import { watchRealtime } from "@/lib/watch-realtime";

export function MessagesInbox({
  viewerId,
  circleName,
  initialInbox,
}: {
  viewerId: string;
  circleName: string;
  initialInbox: DirectInboxItem[];
}) {
  const router = useRouter();
  const search = useSearchParams();
  const requested = search.get("chat");
  const to = search.get("to");
  const [inbox, setInbox] = useState(initialInbox);
  const selected = inbox.find((chat) => chat.id === requested)?.id;
  const [query, setQuery] = useState("");
  const [refreshError, setRefreshError] = useState(false);
  const drafts = useRef(new Map<string, MessageDraft>());
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
        }>("/api/messages");
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
  }, []);
  const conversations = inbox.filter(
    (item) =>
      item.kind === "group" ||
      item.person.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function conversation(item: DirectInboxItem) {
    const name = conversationName(item);
    return (
      <Link
        key={item.id}
        href={`/messages?chat=${encodeURIComponent(item.id)}`}
        scroll={false}
        className={cn("dm-conversation", selected === item.id && "is-selected")}
        aria-current={selected === item.id ? "page" : undefined}
      >
        <Avatar className="size-11">
          <AvatarImage src={item.person?.image ?? undefined} alt="" />
          <AvatarFallback>
            {item.kind === "group" ? (
              <Users className="size-5" />
            ) : (
              item.person.initials
            )}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold">{name}</span>
            {item.lastMessage && (
              <time
                className="dm-preview-time"
                dateTime={item.lastMessage.createdAt}
              >
                {new Date(item.lastMessage.createdAt).toLocaleDateString(
                  "en-US",
                  {
                    timeZone: "America/Phoenix",
                    month: "short",
                    day: "numeric",
                  },
                )}
              </time>
            )}
          </div>
          <div className="flex items-center gap-2">
            <p className={cn("dm-preview", item.unread > 0 && "is-unread")}>
              {item.lastMessage?.senderId === viewerId
                ? "You: "
                : item.kind === "group" && item.lastMessage?.sender
                  ? `${item.lastMessage.sender.name.split(" ")[0]}: `
                  : ""}
              {messagePreview(item.lastMessage)}
            </p>
            {item.unread > 0 && (
              <Badge aria-label={`${item.unread} unread messages`}>
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
          <div className="min-w-0">
            <p className="dm-eyebrow truncate">{circleName}</p>
            <h1 className="dm-title">
              Messages<span className="text-primary">.</span>
            </h1>
          </div>
        </header>
        <div className="dm-search">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find someone"
            aria-label="Search conversations"
          />
        </div>
        {refreshError && (
          <output className="px-4 text-xs text-muted-foreground">
            Reconnecting to your inbox…
          </output>
        )}
        <nav className="dm-conversations" aria-label="Conversations">
          {conversations.map(conversation)}
          {!conversations.some((item) => item.kind === "direct") && (
            <Empty className="dm-inbox-empty">
              <EmptyHeader>
                <EmptyTitle>
                  {query ? "No one found" : "Your circle starts here"}
                </EmptyTitle>
                <EmptyDescription>
                  {query
                    ? "Try another name."
                    : "Other members will appear here when they join."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </nav>
      </aside>
      {selected ? (
        <MessageThread
          key={selected}
          id={selected}
          viewerId={viewerId}
          drafts={drafts}
        />
      ) : (
        <div className="dm-idle">
          <Empty className="dm-idle-empty">
            <EmptyHeader>
              <EmptyMedia className="dm-idle-icon">
                <MessageCircle strokeWidth={1.2} />
              </EmptyMedia>
              <EmptyTitle>Your circle, all here.</EmptyTitle>
              <EmptyDescription>
                Pick someone on the left, or talk to the whole circle in
                Everyone.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}
    </div>
  );
}
