import { expect, test } from "bun:test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import {
  createAgentUIStream,
  readUIMessageStream,
  simulateReadableStream,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
  createTimeblockAgent,
  type TimeblockAgentMessage,
} from "@/lib/timeblock-agent";
import { completedChatHistory } from "@/lib/timeblock-chat";
import { createTimeblockStreamState } from "@/lib/timeblock-chat-stream";
import { EMPTY_ROUTINE } from "@/lib/timeblock-routine";

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const user: TimeblockAgentMessage = {
  id: "request",
  role: "user",
  parts: [{ type: "text", text: "Fix the overlaps." }],
};
const row = {
  id: "manual-physics",
  title: "Physics",
  included: true,
  startedAt: "2026-09-24T16:00",
  completedAt: "2026-09-24T17:00",
};
const edit = { summary: "Moved physics", upserts: [row] };

async function consume(model: MockLanguageModelV4, history = [user]) {
  const state = createTimeblockStreamState();
  const stream = await createAgentUIStream({
    agent: createTimeblockAgent(model, "2026-09-28", [], EMPTY_ROUTINE),
    uiMessages: history,
    onError: state.onError,
    onEnd: state.onEnd,
  });
  let message: TimeblockAgentMessage | undefined;
  for await (const next of readUIMessageStream<TimeblockAgentMessage>({
    stream,
    onError: state.recordFailure,
  }))
    message = next;
  return { state, message };
}

test("a rejected tool call can recover, finish cleanly, and remain usable in the next turn", async () => {
  let step = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      const current = step++;
      return {
        stream: simulateReadableStream<LanguageModelV4StreamPart>({
          chunks:
            current < 2
              ? [
                  {
                    type: "tool-call",
                    toolCallId: `edit-${current}`,
                    toolName: "editBlocks",
                    input: JSON.stringify(
                      current === 0
                        ? { ...edit, upserts: [{ ...row, title: 123 }] }
                        : edit,
                    ),
                  },
                  {
                    type: "finish",
                    finishReason: { unified: "tool-calls", raw: undefined },
                    usage,
                  },
                ]
              : [
                  { type: "text-start", id: "text" },
                  {
                    type: "text-delta",
                    id: "text",
                    delta: "Physics moved. No overlaps remain.",
                  },
                  { type: "text-end", id: "text" },
                  {
                    type: "finish",
                    finishReason: { unified: "stop", raw: undefined },
                    usage,
                  },
                ],
        }),
      };
    },
  });
  const { state, message } = await consume(model);
  expect(step).toBe(3);
  expect(message?.parts).toContainEqual(
    expect.objectContaining({
      type: "tool-editBlocks",
      state: "output-error",
      toolCallId: "edit-0",
    }),
  );
  expect(message?.parts).toContainEqual(
    expect.objectContaining({
      type: "tool-editBlocks",
      state: "output-available",
      output: expect.objectContaining({
        ok: true,
        rows: [{ ...row, status: null }],
        routine: EMPTY_ROUTINE,
      }),
    }),
  );
  expect(state.error).toBeNull();
  // Model results exclude browser-only fingerprints and full draft copies.
  const toolMessages = model.doStreamCalls[2].prompt.filter(
    (m) => m.role === "tool",
  );
  expect(JSON.stringify(toolMessages)).not.toContain('"before"');
  expect(JSON.stringify(toolMessages)).not.toContain('"rows"');
  if (!message) throw new Error("Expected a saved assistant response");
  const followup = await consume(
    model,
    completedChatHistory([user, message, { ...user, id: "next" }]),
  );
  expect(followup.state.error).toBeNull();
});

test("a genuine provider failure after visible text still leaves the run interrupted", async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "text" },
          { type: "text-delta", id: "text", delta: "Working on it." },
          { type: "text-end", id: "text" },
          { type: "error", error: new Error("Provider disconnected") },
          {
            type: "finish",
            finishReason: { unified: "error", raw: undefined },
            usage,
          },
        ],
      }),
    }),
  });
  const { state, message } = await consume(model);
  expect(state.error).toContain("interrupted");
  expect(message?.parts).toContainEqual(
    expect.objectContaining({ text: "Working on it." }),
  );
});

test("a token-limited reply is not marked successful", async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "text" },
          { type: "text-delta", id: "text", delta: "Partly done" },
          { type: "text-end", id: "text" },
          {
            type: "finish",
            finishReason: { unified: "length", raw: undefined },
            usage,
          },
        ],
      }),
    }),
  });
  expect((await consume(model)).state.error).toContain("limit");
});
