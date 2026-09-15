export type SocialAuthor = {
  id: string;
  name: string;
  image: string | null;
  initials: string;
};

export type PostKind = "proof" | "check-in" | "screen-time";
export type LikeTarget = "PROOF" | "CHECK_IN_UPDATE";
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
  definitionOfDone: string;
  mediaIds: string[];
  reviewStatus: ProofStatus;
  canReview: boolean;
  requiredApprovals: number;
  verifiedBy: string | null;
};

export type CheckInPost = PostBase & {
  kind: "check-in";
  signal: string;
  mood?: number | null;
  feelings?: string[];
  day: string;
  checkInId: string;
  legacyCommentCount: number;
};

export type InteractivePost = ProofPost | CheckInPost;
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
  definitionOfDone: string;
  day: string;
  dueAt: string;
  status: TaskStatus;
  proof: { id: string; reviewStatus: ProofStatus } | null;
};

export type SocialMember = SocialAuthor & {
  role: "OWNER" | "MEMBER";
  joinedAt: string;
  tasks: SocialTask[];
  signal: string | null;
  note: string | null;
  mood: number | null;
};

export function postKey(post: Pick<FeedPost, "kind" | "id">) {
  return `${post.kind}:${post.id}`;
}
