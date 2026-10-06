import type { ProofCardData } from "@/components/squad/proof-card";
import type { ThreadReply } from "@/components/squad/social-reply-thread";
import { type LikeRow, likeSummary } from "@/lib/like-summary";
import { shouldMarkMissed } from "@/lib/task-policy";

type Author = {
  id: string;
  name: string;
  image: string | null;
  initials: string;
};

export type ReplyRow = LikeRow & {
  mediaIds?: string[];
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: Author;
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
  ownerId: string;
  owner: { name: string };
  commitment: {
    title: string;
    dueAt: Date;
    proofSubmittedAt?: Date | null;
    status: string;
  };
  replies: ReplyRow[];
  challenge:
    | (LikeRow & {
        id: string;
        reason: string;
        createdAt: Date;
        challenger: Author;
      })
    | null;
};

export function toProofCard(proof: ProofRow): ProofCardData {
  return {
    id: proof.id,
    mediaIds: proof.mediaIds,
    title: proof.commitment.title,
    ownerName: proof.owner.name,
    ownerNote: proof.ownerNote,
    isLate: proof.isLate,
    submittedAt: proof.submittedAt.toISOString(),
    expired:
      proof.commitment.status === "MISSED" ||
      shouldMarkMissed(
        proof.commitment.status,
        proof.commitment.dueAt,
        new Date(),
        proof.commitment.proofSubmittedAt,
      ),
    challenge: proof.challenge
      ? {
          ...likeSummary(proof.challenge),
          id: proof.challenge.id,
          body: proof.challenge.reason,
          createdAt: proof.challenge.createdAt.toISOString(),
          author: proof.challenge.challenger,
          challenge: true,
        }
      : null,
    replies: proof.replies.map(toThreadReply),
  };
}

const TASK_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  DONE: "Done",
  MISSED: "Missed",
  RENEGOTIATED: "Renegotiated",
};

export function taskStatusLabel(status: string) {
  return (
    TASK_STATUS_LABELS[status] ?? status.toLowerCase().replaceAll("_", " ")
  );
}

export function taskStatusVariant(status: string) {
  if (status === "DONE") return "success" as const;
  if (status === "MISSED") return "destructive" as const;
  return "outline" as const;
}
