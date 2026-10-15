"use client";

import { ArrowUpRight, MessageCircle, PenSquare, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageDraft } from "@/components/messages/message-composer";
import { MessageThread } from "@/components/messages/message-thread";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  messageRequest,
  messagesChangedEvent,
} from "@/lib/direct-message-client";
import {
  type DirectInboxItem,
  type DirectPerson,
  messagePreview,
} from "@/lib/direct-message-types";
import { cn } from "@/lib/utils";
import { watchRealtime } from "@/lib/watch-realtime";

export function MessagesInbox({
  viewerId,
  initialInbox,
  contacts,
}: {
  viewerId: string;
  initialInbox: DirectInboxItem[];
  contacts: DirectPerson[];
}) {
  const router = useRouter();
  const search = useSearchParams();
  const selected = search.get("chat");
  const to = search.get("to");
  const [inbox, setInbox] = useState(initialInbox);
  const [query, setQuery] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState(false);
  const drafts = useRef(new Map<string, MessageDraft>());
  const startPending = useRef(false);
  const start = useCallback(
    async (recipientId: string) => {
      if (startPending.current) return;
      startPending.current = true;
      setStarting(recipientId);
      setError("");
      try {
        const result = await messageRequest<{ id: string }>(
          "/api/messages",
          "POST",
          { recipientId },
        );
        router.replace(`/messages?chat=${encodeURIComponent(result.id)}`, {
          scroll: false,
        });
        setOpen(false);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Couldn't start a conversation.",
        );
      } finally {
        setStarting(null);
        startPending.current = false;
      }
    },
    [router],
  );
  useEffect(() => {
    if (to) void start(to);
  }, [to, start]);
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
    const live = watchRealtime(refresh, (event) => event.type === "messages", [
      messagesChangedEvent,
    ]);
    return () => {
      alive = false;
      live.dispose();
    };
  }, []);
  const filtered = inbox.filter((item) =>
    item.person.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const people = contacts.filter((person) =>
    person.name.toLowerCase().includes(peopleQuery.trim().toLowerCase()),
  );
  return (
    <div className="dm-workspace" data-conversation={Boolean(selected)}>
      <aside className="dm-inbox" aria-label="Conversations">
        <header className="dm-inbox-header">
          <div>
            <p className="dm-eyebrow">A little more personal</p>
            <h1 className="dm-title">
              Messages<span className="text-primary">.</span>
            </h1>
          </div>
          <Button
            variant="secondary"
            size="icon"
            aria-label="New message"
            onClick={() => {
              setError("");
              setOpen(true);
            }}
          >
            <PenSquare />
          </Button>
        </header>
        <div className="dm-search">
          <Search className="size-4" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a conversation"
            aria-label="Search conversations"
          />
        </div>
        {refreshError && (
          <output className="px-4 text-xs text-muted-foreground">
            Reconnecting to your inbox…
          </output>
        )}
        {error && !open && (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              {to && (
                <Button variant="ghost" onClick={() => void start(to)}>
                  Retry
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        <nav className="dm-conversations" aria-label="Direct messages">
          {filtered.map((item) => (
            <Link
              key={item.id}
              href={`/messages?chat=${encodeURIComponent(item.id)}`}
              scroll={false}
              className={cn(
                "dm-conversation",
                selected === item.id && "is-selected",
              )}
              aria-current={selected === item.id ? "page" : undefined}
            >
              <Avatar className="size-11">
                <AvatarImage src={item.person.image ?? undefined} alt="" />
                <AvatarFallback>{item.person.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">
                    {item.person.name}
                  </span>
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
                  <p
                    className={cn("dm-preview", item.unread > 0 && "is-unread")}
                  >
                    {item.lastMessage?.senderId === viewerId ? "You: " : ""}
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
          ))}
          {!filtered.length && (
            <Empty className="dm-inbox-empty">
              <EmptyHeader>
                <EmptyTitle>
                  {query ? "No conversations found" : "Your people, one on one"}
                </EmptyTitle>
                <EmptyDescription>
                  {query
                    ? "Try another name."
                    : "Have a quick question, a good photo, or absolutely no reason? Say hey."}
                </EmptyDescription>
              </EmptyHeader>
              {!query && (
                <Button variant="outline" onClick={() => setOpen(true)}>
                  Start a conversation
                  <ArrowUpRight data-icon="inline-end" />
                </Button>
              )}
            </Empty>
          )}
        </nav>
        <p className="dm-inbox-note">One conversation. Two people.</p>
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
              <EmptyTitle>Your side conversations live here.</EmptyTitle>
              <EmptyDescription>
                Send a little encouragement. Share the photo. Ask the question.
                Just the two of you.
              </EmptyDescription>
            </EmptyHeader>
            <Button onClick={() => setOpen(true)} disabled={Boolean(starting)}>
              {starting ? <Spinner /> : <PenSquare data-icon="inline-start" />}
              New message
            </Button>
          </Empty>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Who are we messaging?</DialogTitle>
            <DialogDescription>
              Start a private conversation with someone in your circles.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={peopleQuery}
            onChange={(event) => setPeopleQuery(event.target.value)}
            placeholder="Search by name"
            aria-label="Search people"
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="dm-people">
            {people.map((person) => (
              <Button
                key={person.id}
                variant="ghost"
                className="dm-person"
                disabled={Boolean(starting)}
                onClick={() => void start(person.id)}
              >
                <Avatar>
                  <AvatarImage src={person.image ?? undefined} alt="" />
                  <AvatarFallback>{person.initials}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-left">
                  {person.name}
                </span>
                {starting === person.id ? (
                  <Spinner />
                ) : (
                  <ArrowUpRight data-icon="inline-end" />
                )}
              </Button>
            ))}
            {!people.length && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {peopleQuery
                  ? "No one by that name. Try another search."
                  : "Join a circle with someone to start chatting."}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
