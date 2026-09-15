"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Check, RotateCcw, Sparkles, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Message,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { TimeblockAgentMessage } from "@/lib/timeblock-agent";
import type { TimeblockDraftRow } from "@/lib/timeblock-draft";

import type { TimeblockRoutine } from "@/lib/timeblock-routine";

const suggestions = [
  "Reorganize my whole week around school and sleep",
  "Group my tasks by category and spread out the work",
  "Set school 7:30 AM to 2 PM, then lunch until 3 PM",
];

export function TimeblockChat({
  dueMonday,
  getRows,
  getRoutine,
  applyEdit,
  onBusyChange,
  ready,
}: {
  dueMonday: string;
  getRows: () => TimeblockDraftRow[];
  getRoutine: () => TimeblockRoutine;
  applyEdit: (
    before: string,
    rows: TimeblockDraftRow[],
    routine: TimeblockRoutine,
  ) => boolean;
  onBusyChange: (busy: boolean) => void;
  ready: boolean;
}) {
  const [input, setInput] = useState("");
  const handled = useRef(new Set<string>());
  const [outcomes, setOutcomes] = useState<Record<string, boolean>>({});
  const transport = useMemo(
    () =>
      new DefaultChatTransport<TimeblockAgentMessage>({
        api: "/api/timeblocks/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            dueMonday,
            rows: getRows(),
            routine: getRoutine(),
            messages: messages
              .map((message) => ({
                id: message.id,
                role: message.role,
                parts: message.parts
                  .filter((part) => part.type === "text")
                  .map((part) => ({
                    type: "text",
                    text: part.text.slice(0, 8000),
                  })),
              }))
              .filter((message) => message.parts.length > 0)
              .slice(-24),
          },
        }),
        fetch: (async (url, options) => {
          const response = await fetch(url, options);
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(
              body.error || "Couldn't reach the AI editor. Try again.",
            );
          }
          return response;
        }) as typeof fetch,
      }),
    [dueMonday, getRows, getRoutine],
  );
  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    clearError,
    setMessages,
  } = useChat<TimeblockAgentMessage>({ transport });
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    for (const message of messages)
      for (const part of message.parts) {
        if (
          part.type !== "tool-editBlocks" ||
          part.state !== "output-available" ||
          handled.current.has(part.toolCallId)
        )
          continue;
        handled.current.add(part.toolCallId);
        if (part.output.ok) {
          const applied = applyEdit(
            part.output.before,
            part.output.rows,
            part.output.routine,
          );
          setOutcomes((current) => ({
            ...current,
            [part.toolCallId]: applied,
          }));
        }
      }
  }, [messages, applyEdit]);

  function send(text: string) {
    if (busy || !ready || !text.trim()) return;
    clearError();
    setInput("");
    void sendMessage({ text: text.trim() });
  }

  return (
    <Card className="timeblock-assistant">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary">
            <Sparkles data-icon="inline-start" />
            AI editor
          </Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear conversation"
            disabled={busy || messages.length === 0}
            onClick={() => {
              setMessages([]);
              clearError();
              handled.current.clear();
              setOutcomes({});
            }}
          >
            <RotateCcw />
          </Button>
        </div>
        <CardTitle>Talk your week into shape.</CardTitle>
        <CardDescription>
          Rebuild your week, change routines, or group tasks for printing. Every
          draft edit can be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-4">
        <MessageScrollerProvider autoScroll>
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent className="gap-5 py-3">
                {messages.length === 0 && (
                  <MessageScrollerItem messageId="welcome">
                    <Message>
                      <MessageContent>
                        <Bubble variant="ghost">
                          <BubbleContent>
                            Describe the week you want. I can rearrange the
                            whole schedule, check conflicts, and revise it with
                            you.
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                    <div className="mt-5 flex flex-col items-start gap-2">
                      {suggestions.map((text) => (
                        <Button
                          key={text}
                          variant="outline"
                          size="sm"
                          disabled={!ready}
                          onClick={() => send(text)}
                        >
                          {text}
                          <ArrowUp data-icon="inline-end" />
                        </Button>
                      ))}
                    </div>
                    <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
                      Try “I studied physics Tuesday from 4 to 5:30, then read
                      for 30 minutes.”
                    </p>
                  </MessageScrollerItem>
                )}
                {messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={message.role === "user"}
                  >
                    <Message align={message.role === "user" ? "end" : "start"}>
                      <MessageContent>
                        <MessageHeader>
                          {message.role === "user" ? "You" : "AI editor"}
                        </MessageHeader>
                        {message.parts.map((part, index) => {
                          if (part.type === "text")
                            return (
                              <Bubble
                                key={`${message.id}-${index}`}
                                variant={
                                  message.role === "user"
                                    ? "secondary"
                                    : "ghost"
                                }
                                align={
                                  message.role === "user" ? "end" : "start"
                                }
                              >
                                <BubbleContent className="whitespace-pre-wrap">
                                  {part.text}
                                </BubbleContent>
                              </Bubble>
                            );
                          if (part.type === "tool-inspectSchedule")
                            return (
                              <Badge key={part.toolCallId} variant="secondary">
                                {part.state === "output-available"
                                  ? "Schedule checked"
                                  : part.state === "output-error"
                                    ? "Check failed"
                                    : busy
                                      ? "Checking schedule…"
                                      : "Check interrupted"}
                              </Badge>
                            );
                          if (part.type !== "tool-editBlocks") return null;
                          if (part.state === "output-available")
                            return (
                              <div
                                key={part.toolCallId}
                                className="flex flex-col items-start gap-2"
                              >
                                <Badge
                                  variant={
                                    part.output.ok ? "outline" : "destructive"
                                  }
                                >
                                  {part.output.ok ? (
                                    <Check data-icon="inline-start" />
                                  ) : null}
                                  {part.output.ok
                                    ? outcomes[part.toolCallId] === false
                                      ? "Not applied"
                                      : outcomes[part.toolCallId] === true
                                        ? "Draft updated"
                                        : "Applying draft…"
                                    : "Edit needs a fix"}
                                </Badge>
                                <p className="text-xs text-muted-foreground">
                                  {part.output.ok
                                    ? outcomes[part.toolCallId] === false
                                      ? "You edited the draft while I was working. Ask me to try that change again."
                                      : part.output.summary
                                    : part.output.error}
                                </p>
                              </div>
                            );
                          if (part.state === "output-error")
                            return (
                              <Badge
                                key={part.toolCallId}
                                variant="destructive"
                              >
                                Could not edit blocks
                              </Badge>
                            );
                          return (
                            <Badge key={part.toolCallId} variant="secondary">
                              {busy ? (
                                <Spinner data-icon="inline-start" />
                              ) : null}
                              {busy ? "Editing blocks…" : "Edit interrupted"}
                            </Badge>
                          );
                        })}
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ))}
                {busy && (
                  <MessageScrollerItem messageId="working">
                    <output className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Spinner className="size-3" />
                      Working on your week…
                    </output>
                  </MessageScrollerItem>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Couldn't finish</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send(input);
          }}
          className="flex flex-col gap-3"
        >
          <Field>
            <FieldLabel htmlFor="timeblock-prompt" className="sr-only">
              Message the AI editor
            </FieldLabel>
            <Textarea
              id="timeblock-prompt"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={4000}
              placeholder="Add, change, rethink…"
              className="min-h-24 resize-none"
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  send(input);
                }
              }}
            />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Undo any edit. Recurring routines save across weeks.
            </p>
            {busy ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Stop AI response"
                onClick={() => void stop()}
              >
                <Square />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                aria-label="Send message"
                disabled={!ready || !input.trim()}
              >
                <ArrowUp />
              </Button>
            )}
          </div>
        </form>
      </CardFooter>
    </Card>
  );
}
