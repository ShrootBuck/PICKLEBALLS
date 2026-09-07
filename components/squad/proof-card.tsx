import { Bot } from "lucide-react";
import { MediaGallery } from "@/components/media/media-gallery";
import { AiRetryButton } from "@/components/squad/ai-retry-button";
import { ProofImageViewer } from "@/components/squad/proof-image-viewer";
import { ReviewProof } from "@/components/squad/review-proof";
import {
  SocialReplyThread,
  type ThreadReply,
} from "@/components/squad/social-reply-thread";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@/components/ui/item";
import { formatProofTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export type ProofReview = {
  id: string;
  decision: "APPROVED" | "CHALLENGED";
  note: string | null;
  createdAt: string;
  reviewerName: string;
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
  approvals: number;
  requiredApprovals: number;
  alreadyReviewed: boolean;
  myReview: ProofReview | null;
  reviews: ProofReview[];
  replies: ThreadReply[];
  aiStatus: "PENDING" | "SUCCEEDED" | "FAILED";
  aiVisibleEvidence: string | null;
  aiReviewerQuestion: string | null;
  aiUncertainty: string | null;
  aiTaskMatch: string | null;
  aiOneLiner: string | null;
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
  const aiStalled =
    proof.aiStatus === "PENDING" &&
    Date.now() - new Date(proof.submittedAt).getTime() > 120_000;
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
              {statusBadge(proof.reviewStatus)}
              {proof.aiStatus === "PENDING" && !aiStalled ? (
                <Badge variant="outline">AI reading…</Badge>
              ) : null}
              {proof.aiStatus === "FAILED" || aiStalled ? (
                <AiRetryButton proofId={proof.id} />
              ) : null}
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
            {proof.aiStatus === "SUCCEEDED" ? (
              <Alert>
                <Bot />
                <AlertTitle>{proof.aiOneLiner || "AI read"}</AlertTitle>
                {proof.aiVisibleEvidence ? (
                  <AlertDescription className="whitespace-pre-wrap">
                    {proof.aiVisibleEvidence}
                  </AlertDescription>
                ) : null}
              </Alert>
            ) : null}
            {proof.reviewStatus === "PENDING" ? (
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
            {proof.reviews.length > 0 ? (
              <ItemGroup className="gap-2">
                {proof.reviews.map((review) => (
                  <Item
                    role="listitem"
                    key={review.id}
                    size="sm"
                    variant="muted"
                  >
                    <ItemContent>
                      <ItemHeader>
                        <ItemTitle className="text-[13px]">
                          {review.reviewerName}
                        </ItemTitle>
                        <Badge
                          variant={
                            review.decision === "CHALLENGED"
                              ? "destructive"
                              : "success"
                          }
                        >
                          {review.decision === "CHALLENGED"
                            ? "Challenged"
                            : "Approved"}
                        </Badge>
                      </ItemHeader>
                      {review.note ? (
                        <ItemDescription className="text-sm text-foreground">
                          {review.note}
                        </ItemDescription>
                      ) : (
                        <ItemDescription>No note. Just a vote.</ItemDescription>
                      )}
                      <div className="mt-2">
                        <SocialReplyThread
                          targetType="REVIEW"
                          targetId={review.id}
                          initialReplies={review.replies}
                          currentUserId={viewerId}
                          compact
                          defaultExpanded={focusId === review.id}
                        />
                      </div>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            ) : null}
            <SocialReplyThread
              targetType="PROOF"
              targetId={proof.id}
              initialReplies={proof.replies}
              currentUserId={viewerId}
              compact={compact}
              defaultExpanded={focusId === proof.id}
            />
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
