import { expect, test } from "bun:test";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { aiModelId, openRouterModelSettings } from "@/lib/ai-config";

test("the shared provider sends maximum working reasoning without a token cap", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const provider = createOpenRouter({
    apiKey: "test-only",
    fetch: (async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({
        id: "test-generation",
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
  await generateText({
    model: provider(aiModelId, openRouterModelSettings("test-user")),
    prompt: "Hello",
  });
  expect(requestBody?.model).toBe("meta/muse-spark-1.3-contributor");
  expect(requestBody?.reasoning).toEqual({ effort: "xhigh", exclude: true });
  expect(requestBody?.max_tokens).toBeUndefined();
  expect(requestBody?.user).toBe("test-user");
});
