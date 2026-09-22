"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart } from "ai";
import {
  ArrowUp,
  Check,
  Copy,
  Maximize2,
  Minimize2,
  Paperclip,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatAttachment } from "@/components/timeblocks/chat-attachment";
import { ChatMarkdown } from "@/components/timeblocks/chat-markdown";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AttachmentGroup } from "@/components/ui/attachment";
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
import {
  CHAT_FILE_LIMIT,
  chatFileAccept,
  chatFileType,
  chatUploadSchema,
  type TimeblockChatSnapshot,
} from "@/lib/timeblock-chat";
import type { TimeblockDraftRow } from "@/lib/timeblock-draft";
import { reportFingerprint } from "@/lib/timeblock-editor";
import type { TimeblockRoutine } from "@/lib/timeblock-routine";
import { cn } from "@/lib/utils";

type Props = {
  dueMonday: string;
  draftKey: string;
  getRows: () => TimeblockDraftRow[];
  getRoutine: () => TimeblockRoutine;
  applyEdit: (
    before: string,
    rows: TimeblockDraftRow[],
    routine: TimeblockRoutine,
  ) => boolean;
  onBusyChange: (busy: boolean) => void;
  ready: boolean;
};
type PendingFile = {
  id: string;
  part: FileUIPart;
  state: "uploading" | "done" | "error";
  error?: string;
};
async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Couldn't reach your chat. Try again.");
  return data;
}

export function TimeblockChat(props: Props) {
  const [snapshot, setSnapshot] = useState<TimeblockChatSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setSnapshot(
        await responseJson<TimeblockChatSnapshot>(
          await fetch("/api/timeblocks/chat", { cache: "no-store" }),
        ),
      );
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Couldn't load the chat.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!snapshot)
    return (
      <Card className="timeblock-assistant">
        <CardHeader>
          <CardTitle>Timeblock AI</CardTitle>
          <CardDescription>Your week, one conversation.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn't load your conversation</AlertTitle>
              <AlertDescription>
                {loadError}
                <Button variant="outline" onClick={() => void load()}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <output className="flex items-center gap-2">
              <Spinner />
              Loading your conversation…
            </output>
          )}
        </CardContent>
      </Card>
    );
  return (
    <Conversation
      key={snapshot.id}
      {...props}
      initial={snapshot}
      onReplace={setSnapshot}
    />
  );
}

function Conversation({
  initial,
  onReplace,
  dueMonday,
  draftKey,
  getRows,
  getRoutine,
  applyEdit,
  onBusyChange,
  ready,
}: Props & {
  initial: TimeblockChatSnapshot;
  onReplace: (snapshot: TimeblockChatSnapshot) => void;
}) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [remoteRunning, setRemoteRunning] = useState(initial.running);
  const [notice, setNotice] = useState<string | null>(initial.error);
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const revision = useRef(initial.revision);
  const handled = useRef<Record<string, boolean>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const syncingRef = useRef(false);
  const live = useRef(false);
  const pendingRequests = useRef<string[]>([]);
  const receiptsKey = `${draftKey}:chat:${initial.id}:edits`;
  const requestsKey = `${receiptsKey}:requests`;
  const composerKey = `pb-chat:${initial.id}:composer`;
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const transport = useMemo(
    () =>
      new DefaultChatTransport<TimeblockAgentMessage>({
        api: "/api/timeblocks/chat",
        prepareSendMessagesRequest: ({ messages, trigger }) => {
          const message = messages.findLast(
            (message) => message.role === "user",
          );
          if (message && !pendingRequests.current.includes(message.id)) {
            pendingRequests.current.push(message.id);
            try {
              localStorage.setItem(
                requestsKey,
                JSON.stringify(pendingRequests.current),
              );
            } catch {
              /* A live response can still apply edits. */
            }
          }
          return {
            body: {
              id: initial.id,
              revision: revision.current,
              trigger,
              dueMonday,
              rows: getRows(),
              routine: getRoutine(),
              message,
            },
          };
        },
        fetch: (async (url, options) => {
          const response = await fetch(url, options);
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || "Couldn't reach the AI. Try again.");
          }
          revision.current += 1;
          setRemoteRunning(true);
          setInput("");
          setFiles([]);
          setNotice(null);
          return response;
        }) as typeof fetch,
      }),
    [initial.id, dueMonday, getRows, getRoutine, requestsKey],
  );
  const {
    messages,
    sendMessage,
    regenerate,
    status,
    stop,
    error,
    clearError,
    setMessages,
  } = useChat<TimeblockAgentMessage>({
    id: initial.id,
    messages: initial.messages,
    transport,
    onFinish: () => {
      live.current = false;
      void refreshRef.current();
    },
    onError: () => {
      live.current = false;
      void refreshRef.current();
    },
  });
  const streaming = status === "submitted" || status === "streaming";
  const busy = streaming || remoteRunning || syncing;

  const refresh = useCallback(async () => {
    if (live.current || syncingRef.current) return;
    syncingRef.current = true;
    try {
      const snapshot = await responseJson<TimeblockChatSnapshot>(
        await fetch("/api/timeblocks/chat", { cache: "no-store" }),
      );
      if (live.current) return;
      if (snapshot.id !== initial.id) {
        onReplace(snapshot);
        return;
      }
      revision.current = snapshot.revision;
      setMessages(snapshot.messages);
      setRemoteRunning(snapshot.running);
      setNotice(snapshot.error);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Couldn't sync the chat.",
      );
    } finally {
      syncingRef.current = false;
    }
  }, [initial.id, onReplace, setMessages]);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (remoteRunning && !live.current) void refresh();
    }, 2000);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [remoteRunning, refresh]);
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    try {
      pendingRequests.current = JSON.parse(
        localStorage.getItem(requestsKey) || "[]",
      );
      handled.current = JSON.parse(localStorage.getItem(receiptsKey) || "{}");
      setOutcomes(handled.current);
      const saved = JSON.parse(localStorage.getItem(composerKey) || "{}");
      setInput(typeof saved.input === "string" ? saved.input : "");
      setFiles(Array.isArray(saved.files) ? saved.files : []);
    } catch {
      setNotice(
        "Device storage is unavailable. Sent messages still save to your account.",
      );
    }
    setHydrated(true);
  }, [receiptsKey, composerKey, requestsKey]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        composerKey,
        JSON.stringify({
          input,
          files: files.filter((file) => file.state === "done"),
        }),
      );
    } catch {
      /* Server history remains available. */
    }
  }, [input, files, hydrated, composerKey]);
  useEffect(() => {
    if (!ready || !hydrated) return;
    let changed = false;
    let requestId = "";
    for (const message of messages) {
      if (message.role === "user") requestId = message.id;
      for (const part of message.parts) {
        if (
          part.type !== "tool-editBlocks" ||
          part.state !== "output-available" ||
          !part.output.ok ||
          part.output.draftKey !== draftKey ||
          !pendingRequests.current.includes(requestId) ||
          part.toolCallId in handled.current
        )
          continue;
        const output = part.output;
        const alreadyApplied =
          reportFingerprint(getRows(), getRoutine()) ===
          reportFingerprint(output.rows, output.routine);
        handled.current[part.toolCallId] =
          alreadyApplied ||
          applyEdit(output.before, output.rows, output.routine);
        changed = true;
      }
    }
    if (changed) {
      setOutcomes({ ...handled.current });
      try {
        localStorage.setItem(receiptsKey, JSON.stringify(handled.current));
      } catch {
        /* Fingerprints still prevent duplicate mutations. */
      }
    }
  }, [
    messages,
    ready,
    hydrated,
    applyEdit,
    draftKey,
    receiptsKey,
    getRows,
    getRoutine,
  ]);

  async function action(action: "stop" | "reset") {
    setSyncing(true);
    try {
      const snapshot = await responseJson<TimeblockChatSnapshot>(
        await fetch("/api/timeblocks/chat", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: initial.id, action }),
        }),
      );
      await stop();
      live.current = false;
      if (action === "reset") {
        try {
          localStorage.removeItem(composerKey);
        } catch {
          /* Reset already saved on the server. */
        }
        onReplace(snapshot);
      } else {
        setMessages(snapshot.messages);
        setRemoteRunning(false);
        revision.current = snapshot.revision;
      }
      clearError();
      setNotice(null);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Couldn't update the chat.",
      );
    } finally {
      setSyncing(false);
    }
  }
  function send(text: string) {
    if (
      busy ||
      !ready ||
      !hydrated ||
      files.some((file) => file.state !== "done") ||
      (!text.trim() && !files.length)
    )
      return;
    clearError();
    setNotice(null);
    live.current = true;
    onBusyChange(true);
    void sendMessage({
      ...(text.trim() ? { text: text.trim() } : {}),
      files: files.map((file) => file.part),
    });
  }
  async function attach(selected: File[]) {
    if (busy) return;
    if (selected.length + files.length > CHAT_FILE_LIMIT) {
      setNotice(`Attach up to ${CHAT_FILE_LIMIT} files per message.`);
      return;
    }
    const batch = selected.map((file) => ({
      file,
      id: crypto.randomUUID(),
      mediaType: chatFileType(file),
    }));
    for (const item of batch) {
      const parsed = chatUploadSchema.safeParse({
        chatId: initial.id,
        filename: item.file.name,
        mediaType: item.mediaType,
        sizeBytes: item.file.size,
      });
      if (!parsed.success) {
        setNotice(
          "Choose images, PDFs, audio, video, or text files up to 100 MB each (text up to 1 MB).",
        );
        return;
      }
    }
    setNotice(null);
    setFiles((current) => [
      ...current,
      ...batch.map(({ file, id, mediaType }) => ({
        id,
        part: {
          type: "file" as const,
          url: "",
          filename: file.name,
          mediaType,
        },
        state: "uploading" as const,
      })),
    ]);
    await Promise.all(
      batch.map(async ({ file, id, mediaType }) => {
        try {
          const ticket = await responseJson<{
            uploadUrl: string;
            part: FileUIPart;
          }>(
            await fetch("/api/timeblocks/chat/files", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                chatId: initial.id,
                filename: file.name,
                mediaType,
                sizeBytes: file.size,
              }),
            }),
          );
          const uploaded = await fetch(ticket.uploadUrl, {
            method: "PUT",
            headers: { "content-type": mediaType },
            body: file,
          });
          if (!uploaded.ok)
            throw new Error("Upload failed. Remove this file and try again.");
          setFiles((current) =>
            current.map((item) =>
              item.id === id ? { id, part: ticket.part, state: "done" } : item,
            ),
          );
        } catch (error) {
          setFiles((current) =>
            current.map((item) =>
              item.id === id
                ? {
                    ...item,
                    state: "error",
                    error:
                      error instanceof Error ? error.message : "Upload failed",
                  }
                : item,
            ),
          );
        }
      }),
    );
  }

  return (
    <Card
      className={cn(
        "timeblock-assistant",
        expanded && "timeblock-assistant-expanded",
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary">
            <Sparkles data-icon="inline-start" />
            Timeblock AI
          </Badge>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={expanded ? "Shrink chat" : "Expand chat"}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={syncing || !messages.length}
              onClick={() => void action("reset")}
            >
              <Plus data-icon="inline-start" />
              New chat
            </Button>
          </div>
        </div>
        <CardTitle>Your week, worked out together.</CardTitle>
        <CardDescription>
          One saved conversation. Plan, attach context, and refine as you go.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-4">
        <MessageScrollerProvider autoScroll defaultScrollPosition="end">
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent className="gap-5 py-3">
                {messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={message.role === "user"}
                  >
                    <Message align={message.role === "user" ? "end" : "start"}>
                      <MessageContent className="min-w-0 max-w-full">
                        <MessageHeader>
                          {message.role === "user" ? "You" : "Timeblock AI"}
                        </MessageHeader>
                        {message.parts.map((part, index) => {
                          const key = `${message.id}-${index}`;
                          if (part.type === "text")
                            return (
                              <Bubble
                                key={key}
                                variant={
                                  message.role === "user"
                                    ? "secondary"
                                    : "ghost"
                                }
                                align={
                                  message.role === "user" ? "end" : "start"
                                }
                              >
                                <BubbleContent>
                                  {message.role === "user" ? (
                                    <p className="whitespace-pre-wrap break-words">
                                      {part.text}
                                    </p>
                                  ) : (
                                    <ChatMarkdown text={part.text} />
                                  )}
                                </BubbleContent>
                              </Bubble>
                            );
                          if (part.type === "file")
                            return <ChatAttachment key={key} part={part} />;
                          if (part.type === "reasoning" && part.text)
                            return (
                              <details
                                key={key}
                                className="text-sm text-muted-foreground"
                              >
                                <summary>Reasoning summary</summary>
                                <ChatMarkdown text={part.text} />
                              </details>
                            );
                          if (part.type === "source-url")
                            return (
                              <a
                                key={key}
                                href={
                                  /^https?:\/\//i.test(part.url)
                                    ? part.url
                                    : undefined
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs underline"
                              >
                                {part.title || part.url}
                              </a>
                            );
                          if (part.type === "source-document")
                            return (
                              <Badge key={key} variant="outline">
                                {part.title}
                              </Badge>
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
                          if (part.state === "output-available") {
                            if (
                              part.output.ok &&
                              outcomes[part.toolCallId] !== false
                            )
                              return null;
                            return (
                              <p
                                key={part.toolCallId}
                                className="text-xs text-destructive"
                              >
                                {part.output.ok
                                  ? "Your draft changed while I was working. Ask me to try this change again."
                                  : part.output.error}
                              </p>
                            );
                          }
                          return (
                            <Badge
                              key={part.toolCallId}
                              variant={
                                part.state === "output-error"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {part.state === "output-error"
                                ? "Could not edit blocks"
                                : busy
                                  ? "Editing blocks…"
                                  : "Edit interrupted"}
                            </Badge>
                          );
                        })}
                        {message.role === "assistant" &&
                          message.parts.some(
                            (part) => part.type === "text" && part.text,
                          ) && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={
                                copied === message.id
                                  ? "Copied response"
                                  : "Copy response"
                              }
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(
                                    message.parts
                                      .filter((part) => part.type === "text")
                                      .map((part) => part.text)
                                      .join("\n\n"),
                                  )
                                  .then(() => setCopied(message.id))
                                  .catch(() =>
                                    setNotice("Couldn't copy the response."),
                                  );
                              }}
                            >
                              {copied === message.id ? <Check /> : <Copy />}
                            </Button>
                          )}
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ))}
                {busy && (
                  <MessageScrollerItem messageId="working">
                    <output className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Spinner />
                      {remoteRunning && !streaming
                        ? "Continuing your response…"
                        : "Working on your week…"}
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
        {(error || notice) && (
          <Alert variant="destructive">
            <AlertTitle>Chat update</AlertTitle>
            <AlertDescription>
              {error?.message || notice}
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  clearError();
                  void refresh();
                }}
              >
                Reload chat
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send(input);
          }}
          className="flex flex-col gap-3"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void attach(Array.from(event.dataTransfer.files));
          }}
        >
          {!!files.length && (
            <AttachmentGroup>
              {files.map((file) => (
                <ChatAttachment
                  key={file.id}
                  part={file.part}
                  state={file.state}
                  error={file.error}
                  onRemove={() =>
                    setFiles((current) =>
                      current.filter((item) => item.id !== file.id),
                    )
                  }
                />
              ))}
            </AttachmentGroup>
          )}
          {files.some((file) => file.part.mediaType.startsWith("audio/")) && (
            <p className="text-xs text-muted-foreground">
              Muse Spark's audio understanding is currently limited. Attach a
              transcript for details that need to be exact.
            </p>
          )}
          <Field>
            <FieldLabel htmlFor="timeblock-prompt" className="sr-only">
              Message Timeblock AI
            </FieldLabel>
            <Textarea
              id="timeblock-prompt"
              value={input}
              disabled={!hydrated || busy}
              onChange={(event) => setInput(event.target.value)}
              maxLength={32000}
              placeholder="Message, paste an image, or drop a file…"
              className="min-h-28 max-h-48 resize-y"
              onPaste={(event) => {
                if (event.clipboardData.files.length) {
                  event.preventDefault();
                  void attach(Array.from(event.clipboardData.files));
                }
              }}
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={chatFileAccept}
                className="sr-only"
                aria-label="Attach files"
                disabled={busy}
                onChange={(event) => {
                  void attach(Array.from(event.target.files || []));
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Add attachments"
                disabled={busy || !hydrated || files.length >= CHAT_FILE_LIMIT}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip />
              </Button>
              {messages.some((message) => message.role === "user") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || !ready}
                  onClick={() => {
                    clearError();
                    setNotice(null);
                    live.current = true;
                    onBusyChange(true);
                    void regenerate();
                  }}
                >
                  <RotateCcw data-icon="inline-start" />
                  Retry
                </Button>
              )}
            </div>
            {busy ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Stop AI response"
                disabled={syncing}
                onClick={() => void action("stop")}
              >
                <Square />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                aria-label="Send message"
                disabled={
                  !ready ||
                  !hydrated ||
                  (!input.trim() && !files.length) ||
                  files.some((file) => file.state !== "done")
                }
              >
                <ArrowUp />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Images, PDF, audio, video, and text. Up to 6 files, 100 MB each.
            Text files up to 1 MB. Sent messages save to your account.
          </p>
        </form>
      </CardFooter>
    </Card>
  );
}
