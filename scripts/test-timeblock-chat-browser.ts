// Run against PB_TEST_BUILD=1 bun scripts/test-social.ts --serve --media-only.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import type { TimeblockChatSnapshot } from "@/lib/timeblock-chat";
import { reportFingerprint } from "@/lib/timeblock-editor";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1560, height: 1100 },
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3318/login");
  let chat: TimeblockChatSnapshot = {
    id: "browser-chat-test",
    revision: 0,
    messages: [],
    running: false,
    error: null,
  };
  let lastFileCount = 0;
  let delayNextReply = false;
  let beganReply: (() => void) | undefined;
  await page.route("**/api/timeblocks/chat", async (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ json: chat });
    const body = request.postDataJSON();
    if (request.method() === "PATCH") {
      if (body.action === "reset")
        chat = {
          ...chat,
          id: `new-${crypto.randomUUID()}`,
          messages: [],
          revision: 0,
          running: false,
        };
      else chat.running = false;
      return route.fulfill({ json: chat });
    }
    lastFileCount = body.message.parts.filter(
      (part: { type: string }) => part.type === "file",
    ).length;
    const row = {
      id: "manual-chat-test",
      title: "Physics with AI",
      included: true,
      status: null,
      startedAt: "2026-09-15T16:00",
      completedAt: "2026-09-15T17:00",
    };
    const output = {
      ok: true as const,
      before: reportFingerprint(body.rows, body.routine),
      dueMonday: body.dueMonday,
      draftKey: `pb-timeblock:demo-you:demo-circle:${body.dueMonday}`,
      rows: [...body.rows.filter((r: { id: string }) => r.id !== row.id), row],
      routine: body.routine,
      summary: "Added physics on Tuesday.",
      overlaps: [],
    };
    const toolCallId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const text =
      "**Physics is scheduled.**\n\n- Tuesday, 4–5 PM\n- You can undo this edit.\n\n| Day | Plan |\n| --- | --- |\n| Tuesday | Physics |";
    const input = { summary: output.summary, upserts: [row], removeIds: [] };
    chat = {
      ...chat,
      revision: chat.revision + 1,
      messages: [
        ...chat.messages,
        body.message,
        {
          id: messageId,
          role: "assistant",
          parts: [
            {
              type: "tool-editBlocks",
              toolCallId,
              state: "output-available",
              input,
              output,
            },
            { type: "text", text, state: "done" },
          ],
        },
      ],
    };
    if (delayNextReply) {
      delayNextReply = false;
      const finished = chat;
      chat = { ...chat, running: true, messages: chat.messages.slice(0, -1) };
      beganReply?.();
      await new Promise((resolve) => setTimeout(resolve, 2500));
      chat = finished;
    }
    const chunks = [
      { type: "start", messageId },
      { type: "start-step" },
      {
        type: "tool-input-available",
        toolCallId,
        toolName: "editBlocks",
        input,
      },
      { type: "tool-output-available", toolCallId, output },
      { type: "text-start", id: "text" },
      { type: "text-delta", id: "text", delta: text },
      { type: "text-end", id: "text" },
      { type: "finish-step" },
      { type: "finish", finishReason: "stop" },
    ];
    await route.fulfill({
      headers: {
        "content-type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body: `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
    });
  });
  // Uploads use a tiny fixture here. Route privacy and real object uploads are
  // covered separately by the database integration test.
  await page.route("**/api/timeblocks/chat/files", async (route) => {
    const file = route.request().postDataJSON();
    await route.fulfill({
      json: {
        uploadUrl: "http://localhost:3317/test-chat-upload",
        part: {
          type: "file",
          url: "/api/timeblocks/chat/files/browser-file",
          filename: file.filename,
          mediaType: file.mediaType,
        },
      },
    });
  });
  await page.route("**/test-chat-upload", (route) =>
    route.fulfill({ status: 200 }),
  );
  await page.route("**/api/timeblocks/chat/files/browser-file", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto("http://localhost:3317/timeblock?due=2026-09-21");
  const composer = page.getByRole("textbox", { name: "Message Timeblock AI" });
  await composer.waitFor();
  await composer.fill("Preserve this draft");
  await page.reload();
  await page.waitForFunction(
    () =>
      (document.querySelector("#timeblock-prompt") as HTMLTextAreaElement)
        ?.value === "Preserve this draft",
  );
  await page.getByLabel("Attach files", { exact: true }).setInputFiles({
    name: "schedule.png",
    mimeType: "image/png",
    buffer: Buffer.from("test"),
  });
  await page.getByRole("button", { name: "Remove schedule.png" }).waitFor();
  await page.waitForFunction(
    () => !document.querySelector('[data-state="uploading"]'),
  );
  await page.reload();
  await page.getByRole("button", { name: "Remove schedule.png" }).waitFor();
  await composer.fill("Add physics Tuesday 4–5 PM using this screenshot");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector('button[aria-label="Stop AI response"]'),
  );
  await page.locator(".timeblock-chat-prose strong").waitFor();
  assert.equal(lastFileCount, 1);
  const readDraft = () =>
    page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem(
            "pb-timeblock:demo-you:demo-circle:2026-09-21",
          ) || "{}",
        ).rows,
    );
  assert.equal(
    (await readDraft()).filter(
      (r: { id: string }) => r.id === "manual-chat-test",
    ).length,
    1,
  );
  assert.equal(
    await page.getByText("Draft updated", { exact: true }).count(),
    0,
  );
  await page.reload();
  await composer.waitFor();
  await page.getByRole("button", { name: "Undo last edit" }).click();
  await page.reload();
  await page.locator(".timeblock-chat-prose strong").waitFor();
  assert.equal(
    (await readDraft()).filter(
      (r: { id: string }) => r.id === "manual-chat-test",
    ).length,
    0,
  );
  await page.getByRole("button", { name: "Redo last edit" }).click();
  assert.equal(
    (await readDraft()).some(
      (r: { id: string }) => r.id === "manual-chat-test",
    ),
    true,
  );
  await page.getByRole("button", { name: "Undo last edit" }).click();
  // Recover a reply after leaving the original HTTP stream mid-response.
  delayNextReply = true;
  const started = new Promise<void>((resolve) => {
    beganReply = resolve;
  });
  await composer.fill("Add physics again, and keep working if I refresh");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await started;
  await page.waitForFunction(() => {
    const undo = document.querySelector(
      'button[aria-label="Undo last edit"]',
    ) as HTMLButtonElement | null;
    const redo = document.querySelector(
      'button[aria-label="Redo last edit"]',
    ) as HTMLButtonElement | null;
    return undo?.disabled && redo?.disabled;
  });
  assert.equal(
    await page.getByRole("button", { name: "Undo last edit" }).isDisabled(),
    true,
  );
  assert.equal(
    await page.getByRole("button", { name: "Redo last edit" }).isDisabled(),
    true,
  );
  await page.reload();
  await page.waitForFunction(() =>
    JSON.parse(
      localStorage.getItem("pb-timeblock:demo-you:demo-circle:2026-09-21") ||
        "{}",
    ).rows?.some((row: { id: string }) => row.id === "manual-chat-test"),
  );
  await page.waitForFunction(
    () => !document.querySelector('button[aria-label="Stop AI response"]'),
  );
  await page.goto("http://localhost:3317/timeblock?due=2026-09-14");
  await page.getByRole("textbox", { name: "Message Timeblock AI" }).waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem(
            "pb-timeblock:demo-you:demo-circle:2026-09-14",
          ) || "{}",
        ).rows?.some((row: { id: string }) => row.id === "manual-chat-test") ||
        false,
    ),
    false,
  );
  await page.goto("http://localhost:3317/timeblock?due=2026-09-21");
  await page.getByRole("textbox", { name: "Message Timeblock AI" }).waitFor();
  await page.locator(".timeblock-assistant").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/private/tmp/timeblock-chat-desktop.png" });
  await page.getByRole("button", { name: "Expand chat" }).click();
  assert(await page.locator(".timeblock-assistant-expanded").count());
  await page.getByRole("button", { name: "Shrink chat" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".timeblock-assistant").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: "/private/tmp/timeblock-chat-mobile.png" });
  await page.getByLabel("Attach files", { exact: true }).setInputFiles({
    name: "voice.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("test"),
  });
  await page.getByText(/audio understanding is currently limited/).waitFor();
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await page.waitForFunction(() => {
    const input = document.querySelector(
      "#timeblock-prompt",
    ) as HTMLTextAreaElement | null;
    return input !== null && !input.disabled && input.value === "";
  });
  assert.equal(
    await page.getByText("What does your week need?", { exact: true }).count(),
    0,
  );
  assert.equal(await composer.inputValue(), "");
  assert.equal(chat.messages.length, 0);
  assert.equal(
    (await readDraft()).filter(
      (r: { id: string }) => r.id === "manual-chat-test",
    ).length,
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Passed: draft/upload restore, multimodal send, streamed tools, Markdown, undo across refresh, mid-response recovery, week isolation, expand, mobile layout, audio notice, and New chat.",
  );
} finally {
  await browser.close();
}
