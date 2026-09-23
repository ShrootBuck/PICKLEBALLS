import type { ProofCardData } from "@/components/squad/proof-card";
import type { ThreadReply } from "@/components/squad/social-reply-thread";
import { type LikeRow, likeSummary } from "@/lib/like-summary";
import { shouldMarkMissed } from "@/lib/task-policy";

export type ReplyRow = LikeRow & {
  mediaIds?: string[];
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string;
    image: string | null;
    initials: string;
  };
};

export function toThreadReply(reply: ReplyRow): ThreadReply {
  return {
    ...likeSummary(reply),
    id: reply.id,
    mediaIds: reply.mediaIds,
    body: reply.body,
    createdAt: reply.createdAt.toISOString(),
    updatedAt: reply.updatedAt.toISOString(),
    author: reply.author,
  };
}

export type ProofRow = {
  mediaIds?: string[];
  id: string;
  ownerNote: string | null;
  isLate: boolean;
  submittedAt: Date;
  reviewStatus: "PENDING" | "APPROVED" | "CHALLENGED";
  ownerId: string;
  owner: { name: string };
  commitment: {
    title: string;
    dueAt: Date;
    status: string;
  };
  replies: ReplyRow[];
  reviews: Array<{
    id: string;
    decision: "APPROVED" | "CHALLENGED";
    note: string | null;
    createdAt: Date;
    reviewerId: string;
    reviewer: { name: string };
    replies: ReplyRow[];
  }>;
};

export function toProofCard(
  proof: ProofRow,
  viewerId: string,
  requiredApprovals: number,
): ProofCardData {
  const mappedReviews = proof.reviews.map((review) => ({
    id: review.id,
    decision: review.decision,
    note: review.note,
    createdAt: review.createdAt.toISOString(),
    reviewerName: review.reviewer.name,
    reviewerId: review.reviewerId,
    replies: review.replies.map(toThreadReply),
  }));
  const reviewerByReviewId = new Map(
    proof.reviews.map((review) => [review.id, review.reviewerId] as const),
  );
  const mine =
    mappedReviews.find(
      (review) => reviewerByReviewId.get(review.id) === viewerId,
    ) ?? null;
  return {
    id: proof.id,
    mediaIds: proof.mediaIds,
    title: proof.commitment.title,
    ownerName: proof.owner.name,
    ownerId: proof.ownerId,
    ownerNote: proof.ownerNote,
    isLate: proof.isLate,
    submittedAt: proof.submittedAt.toISOString(),
    reviewStatus: proof.reviewStatus,
    expired:
      proof.commitment.status === "MISSED" ||
      shouldMarkMissed(proof.commitment.status, proof.commitment.dueAt),
    approvals: proof.reviews.filter((review) => review.decision === "APPROVED")
      .length,
    requiredApprovals,
    alreadyReviewed: mine != null,
    myReview: mine,
    reviews: mappedReviews,
    replies: proof.replies.map(toThreadReply),
  };
}

const TASK_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  AWAITING_REVIEW: "Needs verdict",
  VERIFIED: "Verified",
  MISSED: "Missed",
  RENEGOTIATED: "Renegotiated",
};

export function taskStatusLabel(status: string) {
  return (
    TASK_STATUS_LABELS[status] ?? status.toLowerCase().replaceAll("_", " ")
  );
}

export function taskStatusVariant(status: string) {
  if (status === "VERIFIED") return "success" as const;
  if (status === "MISSED") return "destructive" as const;
  if (status === "AWAITING_REVIEW") return "secondary" as const;
  return "outline" as const;
}
