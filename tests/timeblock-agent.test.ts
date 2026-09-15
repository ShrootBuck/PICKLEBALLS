import { expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { createTimeblockAgent } from "@/lib/timeblock-agent";
import { reportFingerprint } from "@/lib/timeblock-editor";
import { EMPTY_ROUTINE } from "@/lib/timeblock-routine";

test("agent inspects, receives a validation error, repairs, and checks successive edits against current state", async () => {
  const initial = {
    id: "proof-1",
    title: "Physics",
    status: "VERIFIED" as const,
    included: true,
    startedAt: "2026-09-07T16:00",
    completedAt: "2026-09-07T17:00",
  };
  const routine = {
    ...EMPTY_ROUTINE,
    schedule: [],
    listOrder: "category" as const,
  };
  const edit = {
    summary: "Move and categorize physics",
    upserts: [
      {
        ...initial,
        category: "Science",
        startedAt: "2026-09-08T16:00",
        completedAt: "2026-09-08T18:00",
      },
    ],
    removeIds: [],
    routine,
  };
  const calls = [
    { name: "inspectSchedule", input: {} },
    { name: "editBlocks", input: { ...edit, removeIds: ["missing"] } },
    { name: "editBlocks", input: edit },
    { name: "inspectSchedule", input: {} },
    {
      name: "editBlocks",
      input: {
        ...edit,
        upserts: [{ ...edit.upserts[0], title: "Physics problems" }],
      },
    },
    { name: "inspectSchedule", input: {} },
  ];
  let step = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      const call = calls[step++];
      return {
        content: call
          ? [
              {
                type: "tool-call" as const,
                toolCallId: `call-${step}`,
                toolName: call.name,
                input: JSON.stringify(call.input),
              },
            ]
          : [{ type: "text" as const, text: "Updated and checked the week." }],
        finishReason: {
          unified: call ? ("tool-calls" as const) : ("stop" as const),
          raw: undefined,
        },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
  const result = await createTimeblockAgent(
    model,
    "2026-09-14",
    [initial],
    EMPTY_ROUTINE,
  ).generate({ prompt: "Reorganize and categorize my week." });
  expect(result.steps).toHaveLength(7);
  for (const call of model.doGenerateCalls) {
    expect(call.toolChoice).toEqual({ type: "auto" });
    expect(JSON.stringify(call.prompt)).toContain("LATEST SCHEDULE CHECK");
  }
  expect(JSON.stringify(model.doGenerateCalls[5].prompt)).toContain(
    "Physics problems",
  );
  const results = result.steps.flatMap((step) => step.toolResults);
  const edits = results
    .filter((tool) => !tool.dynamic && tool.toolName === "editBlocks")
    .map((tool) => tool.output);
  expect(edits[0].ok).toBe(false);
  expect(edits[1].ok).toBe(true);
  expect(edits[2].ok).toBe(true);
  if (!edits[1].ok || !edits[2].ok) throw new Error("Expected valid edits");
  expect(edits[1].before).toBe(reportFingerprint([initial], EMPTY_ROUTINE));
  expect(edits[2].before).toBe(
    reportFingerprint(edits[1].rows, edits[1].routine),
  );
  expect(edits[2].rows[0].status).toBe("VERIFIED");
  const checks = results
    .filter((tool) => !tool.dynamic && tool.toolName === "inspectSchedule")
    .map((tool) => tool.output);
  expect(checks[0].rows[0].title).toBe("Physics");
  expect(checks[2].rows[0].title).toBe("Physics problems");
  expect(checks[2].conflicts).toEqual([]);
  expect(checks[2].generated).toEqual([]);
});
