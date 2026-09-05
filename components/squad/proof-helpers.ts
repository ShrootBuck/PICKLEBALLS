import type { ProofCardData } from "@/components/squad/proof-card";
import type { ThreadReply } from "@/components/squad/social-reply-thread";

export type ReplyRow = {
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
    id: reply.id,
    body: reply.body,
    createdAt: reply.createdAt.toISOString(),
    updatedAt: reply.updatedAt.toISOString(),
    author: reply.author,
  };
}

export type ProofRow = {
  id: string;
  ownerNote: string | null;
  isLate: boolean;
  submittedAt: Date;
  reviewStatus: "PENDING" | "APPROVED" | "CHALLENGED";
  aiStatus: "PENDING" | "SUCCEEDED" | "FAILED";
  aiVisibleEvidence: string | null;
  aiReviewerQuestion: string | null;
  aiUncertainty: string | null;
  aiTaskMatch: string | null;
  aiOneLiner: string | null;
  ownerId: string;
  owner: { name: string };
  commitment: { title: string; definitionOfDone: string };
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
    title: proof.commitment.title,
    definitionOfDone: proof.commitment.definitionOfDone,
    ownerName: proof.owner.name,
    ownerId: proof.ownerId,
    ownerNote: proof.ownerNote,
    isLate: proof.isLate,
    submittedAt: proof.submittedAt.toISOString(),
    reviewStatus: proof.reviewStatus,
    approvals: proof.reviews.filter((review) => review.decision === "APPROVED")
      .length,
    requiredApprovals,
    alreadyReviewed: mine != null,
    myReview: mine,
    reviews: mappedReviews,
    replies: proof.replies.map(toThreadReply),
    aiStatus: proof.aiStatus,
    aiVisibleEvidence: proof.aiVisibleEvidence,
    aiReviewerQuestion: proof.aiReviewerQuestion,
    aiUncertainty: proof.aiUncertainty,
    aiTaskMatch: proof.aiTaskMatch,
    aiOneLiner: proof.aiOneLiner,
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
  if (status === "VERIFIED") return "default" as const;
  if (status === "MISSED") return "destructive" as const;
  if (status === "AWAITING_REVIEW") return "secondary" as const;
  return "outline" as const;
}

export function signalVariant(signal: string) {
  if (signal === "NAY" || signal === "AT_RISK") return "destructive" as const;
  return "default" as const;
}

export function signalLabel(signal: string) {
  return signal === "NAY" || signal === "AT_RISK" ? "Nay" : "Yay";
}
