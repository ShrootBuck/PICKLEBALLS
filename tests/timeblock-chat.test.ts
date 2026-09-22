import { describe, expect, test } from "bun:test";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { convertToModelMessages, generateText, type UIMessage } from "ai";
import { aiModelId, openRouterModelSettings } from "@/lib/ai-config";
import type { TimeblockAgentMessage } from "@/lib/timeblock-agent";
import {
  chatUploadSchema,
  chatUserMessageSchema,
  completedChatHistory,
} from "@/lib/timeblock-chat";

const file = {
  chatId: "chat-1",
  filename: "context.png",
  sizeBytes: 1024,
  mediaType: "image/png",
};
describe("private chat attachments", () => {
  test("accepts supported modalities and rejects oversized and executable files", () => {
    for (const mediaType of [
      "image/png",
      "application/pdf",
      "audio/mpeg",
      "video/mp4",
      "text/plain",
    ])
      expect(chatUploadSchema.safeParse({ ...file, mediaType }).success).toBe(
        true,
      );
    for (const override of [
      { sizeBytes: 101 * 1024 * 1024 },
      { mediaType: "text/plain", sizeBytes: 2 * 1024 * 1024 },
      { mediaType: "application/javascript" },
      { sizeBytes: 0 },
    ])
      expect(chatUploadSchema.safeParse({ ...file, ...override }).success).toBe(
        false,
      );
  });
  test("accepts attachment-only messages, never arbitrary URLs or client tool results", () => {
    const part = {
      type: "file",
      url: "/api/timeblocks/chat/files/test-id",
      filename: "image.png",
      mediaType: "image/png",
    };
    const message = { id: "m", role: "user", parts: [part] };
    expect(chatUserMessageSchema.safeParse(message).success).toBe(true);
    for (const url of [
      "http://localhost/private",
      "https://example.com/file.png",
      "data:image/png;base64,AAA",
      "/api/timeblocks/chat/files/../private",
    ])
      expect(
        chatUserMessageSchema.safeParse({
          ...message,
          parts: [{ ...part, url }],
        }).success,
      ).toBe(false);
    expect(
      chatUserMessageSchema.safeParse({
        ...message,
        parts: [{ type: "tool-editBlocks", state: "output-available" }],
      }).success,
    ).toBe(false);
    expect(
      chatUserMessageSchema.safeParse({
        ...message,
        parts: Array(7).fill(part),
      }).success,
    ).toBe(false);
  });
});
test("interrupted tool calls are removed from model history without dropping completed results or files", () => {
  const messages = [
    {
      id: "a",
      role: "assistant",
      parts: [
        { type: "text", text: "Checking" },
        {
          type: "tool-inspectSchedule",
          toolCallId: "pending",
          state: "input-available",
          input: {},
        },
        {
          type: "tool-inspectSchedule",
          toolCallId: "failed",
          state: "output-error",
          input: {},
          errorText: "Interrupted",
        },
      ],
    },
  ] as TimeblockAgentMessage[];
  const history = completedChatHistory(messages);
  expect(history[0].parts).toHaveLength(2);
  expect(history[0].parts.at(-1)).toMatchObject({ toolCallId: "failed" });
  expect(messages[0].parts).toHaveLength(3);
});
test("AI SDK file parts reach OpenRouter as image, PDF, audio, and video inputs", async () => {
  let body:
    | {
        messages: {
          content: {
            type: string;
            input_audio?: { data: string; format: string };
          }[];
        }[];
      }
    | undefined;
  const provider = createOpenRouter({
    apiKey: "test",
    fetch: (async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        id: "test",
        model: aiModelId,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "OK" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }) as typeof fetch,
  });
  const message: UIMessage = {
    id: "u",
    role: "user",
    parts: [
      { type: "text", text: "Read these" },
      ...["image/png", "application/pdf", "audio/mpeg", "video/mp4"].map(
        (mediaType) => ({
          type: "file" as const,
          mediaType,
          filename: "context",
          url: `data:${mediaType};base64,aGVsbG8=`,
        }),
      ),
    ],
  };
  await generateText({
    model: provider(aiModelId, openRouterModelSettings("user")),
    messages: await convertToModelMessages([message]),
  });
  expect(
    body?.messages[0].content.map((part: { type: string }) => part.type),
  ).toEqual(["text", "image_url", "file", "input_audio", "video_url"]);
  expect(body?.messages[0].content[3].input_audio).toEqual({
    data: "aGVsbG8=",
    format: "mp3",
  });
});
