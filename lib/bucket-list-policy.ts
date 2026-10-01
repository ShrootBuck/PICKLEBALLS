export type BucketVoteStage = "PROPOSAL" | "COMPLETION";
export type BucketItemStatus =
  | "PROPOSED"
  | "ACTIVE"
  | "COMPLETED"
  | "WITHDRAWN";

export type BucketPerson = {
  id: string;
  name: string;
  image: string | null;
  initials: string;
};

export type BucketItemView = {
  id: string;
  title: string;
  details: string | null;
  status: BucketItemStatus;
  proposer: BucketPerson;
  createdAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  completionRequestedAt: string | null;
  completionRequestedBy: BucketPerson | null;
  // The vote currently open on this item, if any.
  stage: BucketVoteStage | null;
  inFavor: BucketPerson[];
  against: BucketPerson[];
  waiting: BucketPerson[];
  memberCount: number;
  myVote: boolean | null;
  canVote: boolean;
  needsMyVote: boolean;
  canWithdraw: boolean;
  canCancelCompletion: boolean;
  replyCount: number;
};

export type BucketItemRow = {
  id: string;
  title: string;
  details: string | null;
  status: BucketItemStatus;
  proposerId: string;
  proposer: BucketPerson;
  createdAt: Date;
  approvedAt: Date | null;
  completedAt: Date | null;
  completionRequestedAt: Date | null;
  completionRequestedById: string | null;
  completionRequestedBy: BucketPerson | null;
  votes: { userId: string; stage: BucketVoteStage; inFavor: boolean }[];
  _count: { replies: number };
};

export function openBucketVoteStage(item: {
  status: BucketItemStatus;
  completionRequestedAt: Date | string | null;
}): BucketVoteStage | null {
  if (item.status === "PROPOSED") return "PROPOSAL";
  if (item.status === "ACTIVE" && item.completionRequestedAt)
    return "COMPLETION";
  return null;
}

// Only current members count. Someone who left can neither block nor carry a
// vote, and someone who joined mid-vote must weigh in too.
export function bucketTally(
  memberIds: string[],
  votes: { userId: string; inFavor: boolean }[],
) {
  const members = new Set(memberIds);
  const inFavor = new Set<string>();
  const against = new Set<string>();
  for (const vote of votes) {
    if (!members.has(vote.userId)) continue;
    (vote.inFavor ? inFavor : against).add(vote.userId);
  }
  const waiting = [...members].filter(
    (id) => !inFavor.has(id) && !against.has(id),
  );
  return {
    inFavor: [...inFavor],
    against: [...against],
    waiting,
    unanimous: members.size > 0 && inFavor.size === members.size,
  };
}

export function toBucketItemView(
  item: BucketItemRow,
  members: BucketPerson[],
  viewer: { id: string; role: "OWNER" | "MEMBER" },
): BucketItemView {
  const stage = openBucketVoteStage(item);
  const votes = stage ? item.votes.filter((vote) => vote.stage === stage) : [];
  const tally = bucketTally(
    members.map((member) => member.id),
    votes,
  );
  const byId = new Map(members.map((member) => [member.id, member]));
  const people = (ids: string[]) =>
    ids.flatMap((id) => {
      const person = byId.get(id);
      return person ? [person] : [];
    });
  const myVote = votes.find((vote) => vote.userId === viewer.id)?.inFavor;
  // Proposing an idea, or asking to check it off, is already a yes.
  const author =
    stage === "PROPOSAL"
      ? item.proposerId
      : stage === "COMPLETION"
        ? item.completionRequestedById
        : null;
  const isMember = byId.has(viewer.id);
  const canVote = stage !== null && isMember && author !== viewer.id;
  const owner = viewer.role === "OWNER" && isMember;
  return {
    id: item.id,
    title: item.title,
    details: item.details,
    status: item.status,
    proposer: item.proposer,
    createdAt: item.createdAt.toISOString(),
    approvedAt: item.approvedAt?.toISOString() ?? null,
    completedAt: item.completedAt?.toISOString() ?? null,
    completionRequestedAt: item.completionRequestedAt?.toISOString() ?? null,
    completionRequestedBy: item.completionRequestedBy,
    stage,
    inFavor: people(tally.inFavor),
    against: people(tally.against),
    waiting: people(tally.waiting),
    memberCount: members.length,
    myVote: myVote ?? null,
    canVote,
    needsMyVote: canVote && myVote === undefined,
    canWithdraw:
      item.status === "PROPOSED" && (item.proposerId === viewer.id || owner),
    canCancelCompletion:
      stage === "COMPLETION" &&
      (item.completionRequestedById === viewer.id || owner),
    replyCount: item._count.replies,
  };
}

const newestFirst = (a: string | null, b: string | null) =>
  (b ?? "").localeCompare(a ?? "");

// Votes waiting on the viewer come first; everything else is newest first.
export function groupBucketItems(items: BucketItemView[]) {
  const byAttention = (a: BucketItemView, b: BucketItemView) =>
    Number(b.needsMyVote) - Number(a.needsMyVote) ||
    Number(b.stage !== null) - Number(a.stage !== null);
  return {
    voting: items
      .filter((item) => item.status === "PROPOSED")
      .sort(
        (a, b) => byAttention(a, b) || newestFirst(a.createdAt, b.createdAt),
      ),
    list: items
      .filter((item) => item.status === "ACTIVE")
      .sort(
        (a, b) => byAttention(a, b) || newestFirst(a.approvedAt, b.approvedAt),
      ),
    done: items
      .filter((item) => item.status === "COMPLETED")
      .sort((a, b) => newestFirst(a.completedAt, b.completedAt)),
  };
}

export function formatPeople(people: { name: string }[]) {
  const names = people.map((person) => person.name);
  if (names.length <= 2) return names.join(" and ");
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  return `${names.slice(0, 2).join(", ")}, and ${names.length - 2} others`;
}

export function describeBucketVote(item: BucketItemView, viewerId: string) {
  if (!item.stage) return null;
  const proposal = item.stage === "PROPOSAL";
  const named = (people: BucketPerson[]) =>
    formatPeople(
      [...people]
        .sort((a, b) => Number(b.id === viewerId) - Number(a.id === viewerId))
        .map((person) => ({
          name: person.id === viewerId ? "you" : person.name,
        })),
    );
  const capitalized = (text: string) =>
    text.charAt(0).toUpperCase() + text.slice(1);
  const one = item.against.length === 1;
  const onlyViewer = one && item.against[0].id === viewerId;
  const requester = item.completionRequestedBy;
  return {
    count: `${item.inFavor.length} of ${item.memberCount} ${proposal ? "in" : "confirmed"}`,
    requested:
      !proposal && requester
        ? `${requester.id === viewerId ? "You" : requester.name} asked to check this off`
        : null,
    waiting: item.waiting.length ? `Waiting on ${named(item.waiting)}` : null,
    against: !item.against.length
      ? null
      : onlyViewer
        ? proposal
          ? "You’re out"
          : "You said not yet"
        : `${capitalized(named(item.against))} ${
            proposal
              ? one
                ? "is out"
                : "are out"
              : one
                ? "says not yet"
                : "say not yet"
          }`,
  };
}
