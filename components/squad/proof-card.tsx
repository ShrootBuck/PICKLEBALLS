import { MediaGallery } from "@/components/media/media-gallery";
import { ProofImageViewer } from "@/components/squad/proof-image-viewer";
import { ReviewProof } from "@/components/squad/review-proof";
import {
  SocialReplyThread,
  type ThreadReply,
} from "@/components/squad/social-reply-thread";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatProofTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export type ProofReview = {
  id: string;
  decision: "APPROVED" | "CHALLENGED";
  note: string | null;
  createdAt: string;
  reviewerName: string;
  reviewerId: string;
  replies: ThreadReply[];
};

export type ProofCardData = {
  mediaIds?: string[];
  id: string;
  title: string;
  definitionOfDone: string;
  ownerName: string;
  ownerId: string;
  ownerNote: string | null;
  isLate: boolean;
  submittedAt: string;
  reviewStatus: "PENDING" | "APPROVED" | "CHALLENGED";
  expired: boolean;
  approvals: number;
  requiredApprovals: number;
  alreadyReviewed: boolean;
  myReview: ProofReview | null;
  reviews: ProofReview[];
  replies: ThreadReply[];
};

function statusBadge(status: ProofCardData["reviewStatus"]) {
  if (status === "APPROVED") return <Badge variant="success">Verified</Badge>;
  if (status === "CHALLENGED")
    return <Badge variant="destructive">Challenged</Badge>;
  return <Badge variant="secondary">Needs verdict</Badge>;
}

export function ProofCard({
  proof,
  viewerId,
  mode,
  onReviewed,
  focusId,
}: {
  proof: ProofCardData;
  viewerId: string;
  mode: "review" | "history";
  onReviewed?: (proofId: string) => void;
  focusId?: string;
}) {
  const compact = mode === "history";
  const meta = [
    proof.ownerName,
    proof.isLate ? "late" : "on time",
    proof.requiredApprovals === 0
      ? "Solo circle"
      : `${proof.approvals}/${proof.requiredApprovals} approvals`,
  ].join("; ");

  return (
    <Card size="sm" className="gap-0 py-0">
      <div
        className={cn(
          "flex",
          compact
            ? "flex-col items-stretch sm:flex-row"
            : "flex-col md:flex-row",
        )}
      >
        {proof.mediaIds?.length ? (
          <div className="w-full shrink-0 md:w-80">
            <MediaGallery ids={proof.mediaIds} />
          </div>
        ) : (
          <ProofImageViewer
            proofId={proof.id}
            title={proof.title}
            compact={compact}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <CardHeader className={cn("py-3", compact && "sm:pr-3")}>
            <CardTitle className="leading-snug">{proof.title}</CardTitle>
            <CardDescription>{meta}</CardDescription>
            <CardAction className="flex flex-col items-end gap-1">
              {proof.expired ? (
                <Badge variant="destructive">Expired</Badge>
              ) : (
                statusBadge(proof.reviewStatus)
              )}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pb-3">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Done means: </span>
              {proof.definitionOfDone}
            </p>
            {proof.ownerNote ? (
              <p
                className={cn(
                  "text-sm text-pretty",
                  compact && "line-clamp-2 text-muted-foreground",
                )}
              >
                “{proof.ownerNote}”
              </p>
            ) : null}
            {compact ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatProofTime(proof.submittedAt)}
              </p>
            ) : null}
            {!proof.expired && proof.reviewStatus === "PENDING" ? (
              proof.ownerId === viewerId ? (
                <Badge variant="secondary" className="w-fit">
                  Your proof. Friends decide
                </Badge>
              ) : proof.alreadyReviewed ? (
                <Badge variant="outline" className="w-fit">
                  You already voted
                  {proof.myReview?.note ? `: “${proof.myReview.note}”` : ""}
                </Badge>
              ) : (
                <ReviewProof
                  proofId={proof.id}
                  taskTitle={proof.title}
                  requiredApprovals={proof.requiredApprovals}
                  onReviewed={onReviewed}
                />
              )
            ) : null}
            <Separator />
            <SocialReplyThread
              contextLabel={`Commenting on ${proof.ownerName}'s proof: ${proof.title}`}
              targetType="PROOF"
              targetId={proof.id}
              initialReplies={[
                ...proof.replies,
                ...proof.reviews.flatMap((review) =>
                  review.replies.map((reply) => ({
                    ...reply,
                    replyContext: `Reply to ${review.reviewerName}’s verdict`,
                  })),
                ),
              ]
                .sort(
                  (a, b) =>
                    b.createdAt.localeCompare(a.createdAt) ||
                    b.id.localeCompare(a.id),
                )
                .slice(0, 50)}
              initialVerdicts={proof.reviews.map((review) => ({
                id: review.id,
                body: review.note ?? "",
                createdAt: review.createdAt,
                verdict: review.decision,
                author: {
                  id: review.reviewerId,
                  name: review.reviewerName,
                  image: null,
                  initials: review.reviewerName
                    .trim()
                    .split(/\s+/)
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join(""),
                },
              }))}
              focusId={focusId}
              currentUserId={viewerId}
              compact={compact}
              defaultExpanded
              composerVisible
            />
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
