import { beforeEach, expect, mock, test } from "bun:test";
import { DomainError } from "@/lib/errors";

mock.module("server-only", () => ({}));
const reviewResult = {
  proofStatus: "PENDING",
  approvalCount: 1,
  requiredApprovals: 3,
};
const reviewProof = mock(async (..._args: unknown[]) => reviewResult);
const limitAction = mock(async (..._args: unknown[]) => {});
let sameOrigin = true;
let signedIn = true;
mock.module("@/lib/tasks", () => ({ reviewProof }));
mock.module("@/lib/rate-limit", () => ({ limitAction }));
mock.module("@/lib/request", () => ({
  hasSameOrigin: () => sameOrigin,
  getRequestMembership: async () =>
    signedIn
      ? {
          session: { user: { id: "reviewer" } },
          membership: { circleId: "circle" },
        }
      : null,
}));
const { POST } = await import("@/app/api/proofs/[id]/review/route");
function submit(body = JSON.stringify({ decision: "APPROVED", note: "nice" })) {
  return POST(
    new Request("http://localhost/api/proofs/proof/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    { params: Promise.resolve({ id: "proof" }) },
  );
}
beforeEach(() => {
  sameOrigin = true;
  signedIn = true;
  reviewProof.mockReset();
  reviewProof.mockResolvedValue(reviewResult);
  limitAction.mockReset();
});
test("POST connects approval to the authenticated circle and returns review progress", async () => {
  const response = await submit();
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ review: reviewResult });
  expect(reviewProof).toHaveBeenCalledWith("proof", "reviewer", "circle", {
    decision: "APPROVED",
    note: "nice",
  });
  expect(limitAction).toHaveBeenCalledWith("reviewer", "reviews", 30, 60_000);
});
test("POST also forwards challenges", async () => {
  expect(
    (
      await submit(
        JSON.stringify({ decision: "CHALLENGED", note: "Missing signature" }),
      )
    ).status,
  ).toBe(201);
  expect(reviewProof).toHaveBeenCalledWith("proof", "reviewer", "circle", {
    decision: "CHALLENGED",
    note: "Missing signature",
  });
});
test("rejects cross-origin requests before review", async () => {
  sameOrigin = false;
  expect((await submit()).status).toBe(403);
  expect(reviewProof).not.toHaveBeenCalled();
});
test("rejects unauthenticated requests before review", async () => {
  signedIn = false;
  expect((await submit()).status).toBe(401);
  expect(reviewProof).not.toHaveBeenCalled();
});
test("malformed JSON cannot create a review", async () => {
  expect((await submit("{")).status).toBe(400);
  expect(reviewProof).not.toHaveBeenCalled();
});
test("returns domain failures as actionable JSON", async () => {
  reviewProof.mockRejectedValueOnce(
    new DomainError("You already reviewed this proof.", 409),
  );
  const response = await submit();
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: "You already reviewed this proof.",
  });
});
test("rate limiting prevents review writes", async () => {
  limitAction.mockRejectedValueOnce(new DomainError("Slow down.", 429));
  expect((await submit()).status).toBe(429);
  expect(reviewProof).not.toHaveBeenCalled();
});
