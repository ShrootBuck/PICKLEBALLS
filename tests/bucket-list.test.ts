import { expect, test } from "bun:test";
import {
  type BucketItemRow,
  bucketPlanReady,
  bucketTally,
  describeBucketVote,
  formatPeople,
  groupBucketItems,
  openBucketVoteStage,
  toBucketItemView,
} from "@/lib/bucket-list-policy";

const person = (id: string) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  image: null,
  initials: id.slice(0, 2).toUpperCase(),
});
const members = ["zayd", "eddie", "sam", "jules"].map(person);
const owner = { id: "zayd", role: "OWNER" as const };
const member = (id: string) => ({ id, role: "MEMBER" as const });

function row(overrides: Partial<BucketItemRow> = {}): BucketItemRow {
  return {
    scheduledFor: null,
    minimumParticipants: 2,
    everyoneRequired: false,
    requiredMemberIds: [],
    completionParticipantIds: members.map((p) => p.id),
    planVersion: 0,
    id: "item",
    title: "Go skydiving",
    details: null,
    status: "PROPOSED",
    proposerId: "sam",
    proposer: person("sam"),
    createdAt: new Date("2026-09-30T18:00:00Z"),
    approvedAt: null,
    completedAt: null,
    completionRequestedAt: null,
    completionRequestedById: null,
    completionRequestedBy: null,
    votes: [{ userId: "sam", stage: "PROPOSAL", inFavor: true }],
    _count: { replies: 0 },
    ...overrides,
  };
}

test("only a yes from every current member is unanimous", () => {
  const ids = ["a", "b", "c"];
  expect(
    bucketTally(ids, [
      { userId: "a", inFavor: true },
      { userId: "b", inFavor: true },
    ]),
  ).toEqual({
    inFavor: ["a", "b"],
    against: [],
    waiting: ["c"],
    unanimous: false,
  });
  expect(
    bucketTally(ids, [
      { userId: "a", inFavor: true },
      { userId: "b", inFavor: true },
      { userId: "c", inFavor: false },
    ]).unanimous,
  ).toBe(false);
  expect(
    bucketTally(
      ids,
      ids.map((userId) => ({ userId, inFavor: true })),
    ).unanimous,
  ).toBe(true);
});

test("departed members neither block nor carry a vote, and empty circles never agree", () => {
  const tally = bucketTally(
    ["a", "b"],
    [
      { userId: "a", inFavor: true },
      { userId: "b", inFavor: true },
      { userId: "departed", inFavor: false },
    ],
  );
  expect(tally.unanimous).toBe(true);
  expect(tally.against).toEqual([]);
  expect(
    bucketTally(["a", "b"], [{ userId: "departed", inFavor: true }]),
  ).toMatchObject({ inFavor: [], waiting: ["a", "b"], unanimous: false });
  expect(bucketTally([], []).unanimous).toBe(false);
});

test("each status has at most one open vote", () => {
  const at = new Date();
  expect(
    openBucketVoteStage({ status: "PROPOSED", completionRequestedAt: null }),
  ).toBe("PROPOSAL");
  expect(
    openBucketVoteStage({
      status: "ACTIVE",
      scheduledFor: at,
      completionRequestedAt: null,
    }),
  ).toBe("RSVP");
  expect(
    openBucketVoteStage({ status: "ACTIVE", completionRequestedAt: at }),
  ).toBe("COMPLETION");
  expect(
    openBucketVoteStage({ status: "COMPLETED", completionRequestedAt: at }),
  ).toBeNull();
  expect(
    openBucketVoteStage({ status: "WITHDRAWN", completionRequestedAt: null }),
  ).toBeNull();
});

test("proposers are already in; everyone else votes and can change their vote", () => {
  const item = row({
    votes: [
      { userId: "sam", stage: "PROPOSAL", inFavor: true },
      { userId: "eddie", stage: "PROPOSAL", inFavor: false },
    ],
  });
  const proposer = toBucketItemView(item, members, member("sam"));
  expect(proposer).toMatchObject({
    stage: "PROPOSAL",
    canVote: true,
    needsMyVote: false,
    canWithdraw: true,
    myVote: true,
  });
  const eddie = toBucketItemView(item, members, member("eddie"));
  expect(eddie).toMatchObject({
    canVote: true,
    needsMyVote: false,
    myVote: false,
    canWithdraw: false,
  });
  const jules = toBucketItemView(item, members, member("jules"));
  expect(jules).toMatchObject({
    canVote: true,
    needsMyVote: true,
    myVote: null,
  });
  expect(jules.inFavor.map((p) => p.id)).toEqual(["sam"]);
  expect(jules.against.map((p) => p.id)).toEqual(["eddie"]);
  expect(jules.waiting.map((p) => p.id)).toEqual(["zayd", "jules"]);
  expect(toBucketItemView(item, members, owner).canWithdraw).toBe(true);
});

test("a check-off vote ignores proposal votes and lets the requester or owner cancel", () => {
  const item = row({
    status: "ACTIVE",
    approvedAt: new Date("2026-10-01T18:00:00Z"),
    completionRequestedAt: new Date("2026-10-05T18:00:00Z"),
    completionRequestedById: "eddie",
    completionRequestedBy: person("eddie"),
    votes: [
      ...members.map((p) => ({
        userId: p.id,
        stage: "PROPOSAL" as const,
        inFavor: true,
      })),
      { userId: "eddie", stage: "COMPLETION", inFavor: true },
    ],
  });
  const requester = toBucketItemView(item, members, member("eddie"));
  expect(requester).toMatchObject({
    stage: "COMPLETION",
    canVote: true,
    canCancelCompletion: true,
    canWithdraw: false,
    myVote: true,
  });
  expect(requester.inFavor.map((p) => p.id)).toEqual(["eddie"]);
  expect(toBucketItemView(item, members, member("sam"))).toMatchObject({
    canVote: true,
    needsMyVote: true,
    canCancelCompletion: false,
  });
  expect(toBucketItemView(item, members, owner)).toMatchObject({
    canVote: true,
    canCancelCompletion: true,
  });
});

test("settled items have nothing left to vote on", () => {
  const done = toBucketItemView(
    row({
      status: "COMPLETED",
      approvedAt: new Date(),
      completedAt: new Date(),
      completionRequestedAt: new Date(),
      completionRequestedById: "sam",
      completionRequestedBy: person("sam"),
    }),
    members,
    owner,
  );
  expect(done).toMatchObject({
    stage: null,
    canVote: false,
    needsMyVote: false,
    canWithdraw: false,
    canCancelCompletion: false,
  });
  expect(describeBucketVote(done, "zayd")).toBeNull();
});

test("votes waiting on the viewer come first in each section", () => {
  const view = (overrides: Partial<BucketItemRow>, viewer = "zayd") =>
    toBucketItemView(row(overrides), members, member(viewer));
  const voted = view({
    id: "voted",
    createdAt: new Date("2026-09-30T00:00:00Z"),
    votes: [
      { userId: "sam", stage: "PROPOSAL", inFavor: true },
      { userId: "zayd", stage: "PROPOSAL", inFavor: true },
    ],
  });
  const waiting = view({
    id: "waiting",
    createdAt: new Date("2026-09-01T00:00:00Z"),
  });
  const listed = view({
    id: "listed",
    status: "ACTIVE",
    scheduledFor: new Date(),
    votes: [{ userId: "zayd", stage: "RSVP", inFavor: true }],
    approvedAt: new Date("2026-09-20T00:00:00Z"),
  });
  const confirming = view({
    id: "confirming",
    status: "ACTIVE",
    approvedAt: new Date("2026-09-10T00:00:00Z"),
    completionRequestedAt: new Date("2026-09-29T00:00:00Z"),
    completionRequestedById: "sam",
    completionRequestedBy: person("sam"),
    votes: [{ userId: "sam", stage: "COMPLETION", inFavor: true }],
  });
  const old = view({
    id: "old",
    status: "COMPLETED",
    completedAt: new Date("2026-08-01T00:00:00Z"),
  });
  const recent = view({
    id: "recent",
    status: "COMPLETED",
    completedAt: new Date("2026-09-01T00:00:00Z"),
  });
  const groups = groupBucketItems([
    voted,
    listed,
    old,
    waiting,
    recent,
    confirming,
  ]);
  expect(groups.voting.map((item) => item.id)).toEqual(["waiting", "voted"]);
  expect(groups.list.map((item) => item.id)).toEqual(["confirming", "listed"]);
  expect(groups.done.map((item) => item.id)).toEqual(["recent", "old"]);
});

test("interest is separate from RSVPs and only participants confirm", () => {
  const item = row({
    scheduledFor: new Date(),
    status: "PROPOSED",
    votes: [{ userId: "sam", stage: "PROPOSAL", inFavor: true }],
  });
  expect(toBucketItemView(item, members, member("sam"))).toMatchObject({
    stage: "RSVP",
    myVote: null,
    needsMyVote: true,
  });
  const completion = row({
    status: "ACTIVE",
    completionRequestedAt: new Date(),
    completionParticipantIds: ["sam", "eddie"],
    votes: [{ userId: "sam", stage: "COMPLETION", inFavor: true }],
  });
  expect(toBucketItemView(completion, members, owner).canVote).toBe(false);
  const view = toBucketItemView(
    completion,
    [...members, person("new")],
    member("eddie"),
  );
  expect(view.waiting.map((p) => p.id)).toEqual(["eddie"]);
  expect(describeBucketVote(view, "eddie")?.count).toBe("1 of 2 confirmed");
});
test("seven can go without the eighth; everyone-needed uses the saved roster", () => {
  expect(
    bucketPlanReady(
      {
        minimumParticipants: 2,
        everyoneRequired: false,
        requiredMemberIds: [],
      },
      ["a", "b", "c", "d", "e", "f", "g"],
    ),
  ).toBe(true);
  const plan = {
    minimumParticipants: 2,
    everyoneRequired: true,
    requiredMemberIds: ["a", "b"],
  };
  expect(bucketPlanReady(plan, ["a", "new"])).toBe(false);
  expect(bucketPlanReady(plan, ["a", "b"])).toBe(true);
});

test("long name lists stay short", () => {
  const names = ["A", "B", "C", "D", "E"].map((name) => ({ name }));
  expect(formatPeople(names.slice(0, 1))).toBe("A");
  expect(formatPeople(names.slice(0, 2))).toBe("A and B");
  expect(formatPeople(names.slice(0, 3))).toBe("A, B, and C");
  expect(formatPeople(names)).toBe("A, B, and 3 others");
});
