export type SocialAuthor = {
  id: string;
  name: string;
  image: string | null;
  initials: string;
};

export type PostKind = "proof" | "check-in" | "screen-time" | "streak";
export type LikeTarget = "PROOF" | "CHECK_IN_UPDATE" | "STREAK_EVENT";
export type ProofStatus = "PENDING" | "APPROVED" | "CHALLENGED";
export type TaskStatus =
  | "OPEN"
  | "AWAITING_REVIEW"
  | "VERIFIED"
  | "MISSED"
  | "RENEGOTIATED";

type PostBase = {
  id: string;
  circleId: string;
  createdAt: string;
  author: SocialAuthor;
  body: string | null;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
};

export type ProofPost = PostBase & {
  kind: "proof";
  title: string;
  commitmentId: string;
  mediaIds: string[];
  reviewStatus: ProofStatus;
  canReview: boolean;
  expired: boolean;
  requiredApprovals: number;
  approvalCount: number;
  verifiedBy: string | null;
};

export type CheckInPost = PostBase & {
  kind: "check-in";
  mediaIds: string[];
  signal: string;
  mood?: number | null;
  valence?: number | null;
  feelings?: string[];
  impacts?: string[];
  prompt?: string | null;
  day: string;
  checkInId: string;
  legacyCommentCount: number;
};

export type StreakPost = PostBase & {
  kind: "streak";
  event: "STARTED" | "MILESTONE" | "RETIRED";
  streakId: string;
  streakTitle: string;
  streakKind: "QUIT" | "BUILD";
  unitLabel: string | null;
  // The milestone reached, or the final count when retired.
  count: number;
  costCents: number | null;
  units: number | null;
};

export type InteractivePost = ProofPost | CheckInPost | StreakPost;
export type ScreenTimePost = PostBase & {
  kind: "screen-time";
  mediaId: string;
  weekStart: string;
  dailyAverageMinutes: number;
};
export type FeedPost = InteractivePost | ScreenTimePost;
export type FeedPage = { items: FeedPost[]; nextCursor: string | null };

export type SocialTask = {
  id: string;
  title: string;
  day: string;
  dueAt: string;
  proofSubmittedAt?: string | null;
  status: TaskStatus;
  proof: { id: string; reviewStatus: ProofStatus } | null;
  goal?: { id: string; title: string } | null;
};

export type SocialMember = SocialAuthor & {
  role: "OWNER" | "MEMBER";
  joinedAt: string;
  tasks: SocialTask[];
  signal: string | null;
  note: string | null;
  mood: number | null;
  valence: number | null;
};

export function postKey(post: Pick<FeedPost, "kind" | "id">) {
  return `${post.kind}:${post.id}`;
}
