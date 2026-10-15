import { expect, test } from "bun:test";
import type { DirectMessageItem } from "@/lib/direct-message-types";
import { MessageOutbox, type OutgoingMessage } from "@/lib/message-outbox";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function delivered(item: OutgoingMessage, sequence = 1): DirectMessageItem {
  return {
    id: `server-${item.clientId}`,
    clientId: item.clientId,
    senderId: "me",
    sender: null,
    sequence,
    revision: sequence,
    body: item.body,
    mediaIds: item.mediaIds ?? [],
    createdAt: item.createdAt,
    deletedAt: null,
    reactions: [],
    replyTo: null,
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("rapid sends preserve order while the next draft and other chats remain editable", async () => {
  const requests: {
    item: OutgoingMessage;
    gate: ReturnType<typeof deferred<DirectMessageItem>>;
  }[] = [];
  const store = new MessageOutbox(
    (item) => {
      const gate = deferred<DirectMessageItem>();
      requests.push({ item, gate });
      return gate.promise;
    },
    () => {},
    () => {},
  );
  store.restore();
  store.start();
  store.setDraft("a", { body: "first", files: [] });
  store.enqueue("a");
  store.setDraft("a", { body: "second", files: [] });
  store.enqueue("a");
  store.setDraft("a", { body: "still typing", files: [] });
  // Hydration uses the original server snapshot, even if restoration already ran.
  expect(store.getServerSnapshot()).toEqual({
    ready: false,
    drafts: {},
    outbox: [],
  });
  store.setDraft("b", { body: "different chat", files: [] });
  store.enqueue("b");
  expect(requests.map(({ item }) => item.body)).toEqual([
    "first",
    "different chat",
  ]);
  requests[0].gate.resolve(delivered(requests[0].item));
  await settle();
  expect(requests[2].item.body).toBe("second");
  requests[2].gate.resolve(delivered(requests[2].item, 2));
  requests[1].gate.resolve(delivered(requests[1].item));
  await settle();
  expect(store.getSnapshot().drafts.a.body).toBe("still typing");
  expect(
    store.getSnapshot().outbox.every((item) => item.state === "sent"),
  ).toBe(true);
  store.stop();
});

test("failed sends preserve attachment IDs and retry identity without overwriting the next draft", async () => {
  const requests: OutgoingMessage[] = [];
  const attachment = new File(["image"], "photo.png", { type: "image/png" });
  const store = new MessageOutbox(
    async (item, _progress, uploaded) => {
      requests.push(item);
      if (requests.length === 1) {
        uploaded(["i_saved"]);
        throw new Error("offline");
      }
      return delivered(item);
    },
    () => {},
    () => {},
  );
  store.restore();
  store.start();
  store.setDraft("a", { body: "photo", files: [attachment] });
  const id = store.enqueue("a");
  if (!id) throw new Error("Message was not queued");
  store.setDraft("a", { body: "later", files: [] });
  store.enqueue("a");
  store.setDraft("a", { body: "next draft", files: [] });
  await settle();
  expect(requests.length).toBe(1);
  expect(store.getSnapshot().outbox[0].state).toBe("failed");
  store.retry(id);
  store.retry(id);
  await settle();
  expect(requests.map((item) => item.body)).toEqual([
    "photo",
    "photo",
    "later",
  ]);
  expect(requests[1].clientId).toBe(requests[0].clientId);
  expect(requests[1].mediaIds).toEqual(["i_saved"]);
  expect(store.getSnapshot().drafts.a.body).toBe("next draft");
  store.stop();
});

test("realtime confirmation survives a lost HTTP response and ignores another sender's client ID", async () => {
  const gate = deferred<DirectMessageItem>();
  let first: OutgoingMessage | undefined;
  const store = new MessageOutbox(
    async (item) => {
      if (!first) {
        first = item;
        return gate.promise;
      }
      return delivered(item, 2);
    },
    () => {},
    () => {},
  );
  store.restore();
  store.start();
  store.setDraft("a", { body: "arrived", files: [] });
  store.enqueue("a");
  store.setDraft("a", { body: "next", files: [] });
  store.enqueue("a");
  if (!first) throw new Error("Message was not sent");
  const message = delivered(first);
  store.acknowledge("a", [{ ...message, senderId: "peer" }], "me");
  expect(store.getSnapshot().outbox.length).toBe(2);
  store.acknowledge("a", [message], "me");
  gate.reject(new Error("lost response"));
  await settle();
  expect(store.getSnapshot().outbox.length).toBe(1);
  expect(store.getSnapshot().outbox[0].state).toBe("sent");
  store.stop();
});

test("recovered sends wait for an explicit retry and dismiss unblocks only that conversation", async () => {
  const store = new MessageOutbox(
    async (item) => delivered(item),
    () => {},
    () => {},
  );
  store.restore({
    drafts: {},
    outbox: [
      {
        body: "recovered",
        files: [],
        clientId: crypto.randomUUID(),
        conversationId: "a",
        createdAt: new Date().toISOString(),
        state: "failed",
        status: "Interrupted",
        percent: null,
      },
    ],
  });
  store.start();
  store.setDraft("a", { body: "queued behind failure", files: [] });
  store.enqueue("a");
  await settle();
  expect(store.getSnapshot().outbox.map((row) => row.state)).toEqual([
    "failed",
    "queued",
  ]);
  store.dismiss(store.getSnapshot().outbox[0].clientId);
  await settle();
  expect(store.getSnapshot().outbox[0].state).toBe("sent");
  store.stop();
});

test("realtime confirmation releases a stalled response without waiting for its timeout", async () => {
  const calls: OutgoingMessage[] = [];
  const store = new MessageOutbox(
    async (item, _progress, _uploaded, signal) => {
      calls.push(item);
      if (calls.length === 1)
        return new Promise<DirectMessageItem>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("acknowledged")),
            { once: true },
          );
        });
      return delivered(item, 2);
    },
    () => {},
    () => {},
  );
  store.restore();
  store.start();
  store.setDraft("a", { body: "response stuck", files: [] });
  store.enqueue("a");
  store.setDraft("a", { body: "next", files: [] });
  store.enqueue("a");
  store.acknowledge("another-conversation", [delivered(calls[0])], "me");
  expect(store.getSnapshot().outbox.length).toBe(2);
  store.acknowledge("a", [delivered(calls[0])], "me");
  await settle();
  expect(calls.map((item) => item.body)).toEqual(["response stuck", "next"]);
  expect(store.getSnapshot().outbox[0].state).toBe("sent");
  store.stop();
});
