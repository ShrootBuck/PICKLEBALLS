export type BucketVoteStage = "PROPOSAL" | "RSVP" | "COMPLETION";
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
export type BucketPlan = {
  scheduledFor: Date | string | null;
  minimumParticipants: number;
  everyoneRequired: boolean;
  requiredMemberIds: string[];
  completionParticipantIds: string[];
  planVersion: number;
};
export type BucketItemView = Omit<BucketPlan, "scheduledFor"> & {
  id: string;
  title: string;
  details: string | null;
  status: BucketItemStatus;
  proposer: BucketPerson;
  createdAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  scheduledFor: string | null;
  completionRequestedAt: string | null;
  completionRequestedBy: BucketPerson | null;
  stage: BucketVoteStage | null;
  inFavor: BucketPerson[];
  against: BucketPerson[];
  waiting: BucketPerson[];
  participants: BucketPerson[];
  memberCount: number;
  myVote: boolean | null;
  canVote: boolean;
  needsMyVote: boolean;
  canWithdraw: boolean;
  canCancelCompletion: boolean;
  canPlan: boolean;
  canComplete: boolean;
  replyCount: number;
};
export type BucketItemRow = BucketPlan & {
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
  votes: {
    userId: string;
    stage: BucketVoteStage;
    inFavor: boolean;
    user?: BucketPerson;
  }[];
  _count: { replies: number };
};
export function openBucketVoteStage(item: {
  status: BucketItemStatus;
  completionRequestedAt: Date | string | null;
  scheduledFor?: Date | string | null;
}): BucketVoteStage | null {
  if (item.status === "COMPLETED" || item.status === "WITHDRAWN") return null;
  if (item.completionRequestedAt) return "COMPLETION";
  return item.scheduledFor ? "RSVP" : "PROPOSAL";
}
// The caller supplies a fixed electorate for completion or everyone-needed plans.
export function bucketTally(
  memberIds: string[],
  votes: { userId: string; inFavor: boolean }[],
) {
  const members = new Set(memberIds);
  const yes = new Set(
    votes
      .filter((v) => members.has(v.userId) && v.inFavor)
      .map((v) => v.userId),
  );
  const no = new Set(
    votes
      .filter((v) => members.has(v.userId) && !v.inFavor)
      .map((v) => v.userId),
  );
  return {
    inFavor: [...yes],
    against: [...no],
    waiting: [...members].filter((id) => !yes.has(id) && !no.has(id)),
    unanimous: members.size > 0 && yes.size === members.size,
  };
}
export function bucketPlanReady(
  plan: Pick<
    BucketPlan,
    "minimumParticipants" | "everyoneRequired" | "requiredMemberIds"
  >,
  goingIds: string[],
) {
  const going = new Set(goingIds);
  return plan.everyoneRequired
    ? plan.requiredMemberIds.length > 0 &&
        plan.requiredMemberIds.every((id) => going.has(id))
    : going.size >= plan.minimumParticipants;
}
export function toBucketItemView(
  item: BucketItemRow,
  members: BucketPerson[],
  viewer: { id: string; role: "OWNER" | "MEMBER" },
  historicalPeople: BucketPerson[] = [],
): BucketItemView {
  const stage = openBucketVoteStage(item);
  const isMember = members.some((p) => p.id === viewer.id);
  const owner = isMember && viewer.role === "OWNER";
  const byId = new Map(
    [
      ...historicalPeople,
      ...members,
      ...item.votes.flatMap((v) => (v.user ? [v.user] : [])),
    ].map((p) => [p.id, p]),
  );
  const people = (ids: string[]) =>
    ids.map(
      (id) =>
        byId.get(id) ?? {
          id,
          name: "Former member",
          initials: "FM",
          image: null,
        },
    );
  const electorate =
    stage === "COMPLETION"
      ? item.completionParticipantIds
      : item.everyoneRequired && item.scheduledFor
        ? [...new Set([...item.requiredMemberIds, ...members.map((m) => m.id)])]
        : stage === "RSVP"
          ? [
              ...new Set([
                ...members.map((m) => m.id),
                ...item.votes
                  .filter((v) => v.stage === "RSVP")
                  .map((v) => v.userId),
              ]),
            ]
          : members.map((m) => m.id);
  const votes = item.votes.filter((v) => v.stage === (stage ?? "COMPLETION"));
  const tally = bucketTally(electorate, votes);
  const going = item.votes
    .filter((v) => v.stage === "RSVP" && v.inFavor)
    .map((v) => v.userId);
  const participants =
    item.completionRequestedAt || item.status === "COMPLETED"
      ? item.completionParticipantIds
      : going;
  const canVote =
    !!stage &&
    isMember &&
    (stage !== "COMPLETION" ||
      item.completionParticipantIds.includes(viewer.id));
  const myVote = votes.find((v) => v.userId === viewer.id)?.inFavor ?? null;
  return {
    id: item.id,
    title: item.title,
    details: item.details,
    status: item.status,
    proposer: item.proposer,
    scheduledFor: item.scheduledFor
      ? new Date(item.scheduledFor).toISOString()
      : null,
    minimumParticipants: item.minimumParticipants,
    everyoneRequired: item.everyoneRequired,
    requiredMemberIds: item.requiredMemberIds,
    completionParticipantIds: item.completionParticipantIds,
    planVersion: item.planVersion,
    createdAt: item.createdAt.toISOString(),
    approvedAt: item.approvedAt?.toISOString() ?? null,
    completedAt: item.completedAt?.toISOString() ?? null,
    completionRequestedAt: item.completionRequestedAt?.toISOString() ?? null,
    completionRequestedBy: item.completionRequestedBy,
    stage,
    inFavor: people(tally.inFavor),
    against: people(tally.against),
    waiting: people(tally.waiting),
    participants: people(participants),
    memberCount: members.length,
    myVote,
    canVote,
    needsMyVote: canVote && myVote === null,
    canWithdraw:
      (item.status === "PROPOSED" || item.status === "ACTIVE") &&
      (item.proposerId === viewer.id || owner),
    canCancelCompletion:
      stage === "COMPLETION" &&
      (item.completionRequestedById === viewer.id || owner),
    canPlan:
      isMember &&
      !item.completionRequestedAt &&
      (item.status === "PROPOSED" || item.status === "ACTIVE") &&
      (item.proposerId === viewer.id || owner),
    canComplete:
      isMember &&
      item.status === "ACTIVE" &&
      !!item.scheduledFor &&
      new Date(item.scheduledFor).getTime() <= Date.now() &&
      !item.completionRequestedAt &&
      going.includes(viewer.id),
    replyCount: item._count.replies,
  };
}
export function groupBucketItems(items: BucketItemView[]) {
  const attention = (a: BucketItemView, b: BucketItemView) =>
    Number(b.needsMyVote) - Number(a.needsMyVote) ||
    b.createdAt.localeCompare(a.createdAt);
  return {
    voting: items
      .filter(
        (i) =>
          i.status === "PROPOSED" ||
          (i.status === "ACTIVE" &&
            !i.scheduledFor &&
            !i.completionRequestedAt),
      )
      .sort(attention),
    list: items
      .filter(
        (i) =>
          i.status === "ACTIVE" &&
          (!!i.scheduledFor || !!i.completionRequestedAt),
      )
      .sort(attention),
    done: items
      .filter((i) => i.status === "COMPLETED")
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
  };
}
export function formatPeople(people: { name: string }[]) {
  const names = people.map((p) => p.name);
  if (names.length <= 2) return names.join(" and ");
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  return `${names.slice(0, 2).join(", ")}, and ${names.length - 2} others`;
}
export function describeBucketVote(item: BucketItemView, viewerId: string) {
  if (!item.stage) return null;
  const named = (people: BucketPerson[]) =>
    formatPeople(
      people.map((p) => ({ name: p.id === viewerId ? "you" : p.name })),
    );
  const completion = item.stage === "COMPLETION";
  return {
    count: completion
      ? `${item.inFavor.length} of ${item.completionParticipantIds.length} confirmed`
      : item.stage === "PROPOSAL"
        ? `${item.inFavor.length} interested`
        : `${item.inFavor.length} going · ${item.everyoneRequired ? "everyone needed" : `${item.minimumParticipants} needed`}`,
    requested: completion
      ? `${item.completionRequestedBy?.name ?? "Someone"} asked to check this off`
      : null,
    waiting:
      completion && item.waiting.length
        ? `Waiting on ${named(item.waiting)}`
        : null,
    against: item.against.length
      ? `${named(item.against)}: ${completion ? "not yet" : item.stage === "RSVP" ? "can't make it" : "not interested"}`
      : null,
  };
}
