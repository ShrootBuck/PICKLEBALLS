import { Bot } from "lucide-react";
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
  id: string;
  title: string;
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

function matchBadge(match: string | null) {
  if (match === "STRONG") return <Badge variant="default">Looks solid</Badge>;
  if (match === "PARTIAL") return <Badge variant="secondary">Partial</Badge>;
  if (match === "WEAK") return <Badge variant="destructive">Weak</Badge>;
  if (match === "UNREADABLE")
    return <Badge variant="outline">Cannot tell</Badge>;
  return null;
}
function statusBadge(status: ProofCardData["reviewStatus"]) {
  if (status === "APPROVED") return <Badge>Verified</Badge>;
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
    proof.isLate ? "late as hell" : "on time",
    `${proof.approvals}/${proof.requiredApprovals} approvals`,
  ].join(" — ");

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
        <ProofImageViewer
          proofId={proof.id}
          title={proof.title}
          compact={compact}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <CardHeader className={cn("py-3", compact && "sm:pr-3")}>
            <CardTitle className="truncate">{proof.title}</CardTitle>
            <CardDescription className="truncate">{meta}</CardDescription>
            <CardAction className="flex flex-col items-end gap-1">
              {statusBadge(proof.reviewStatus)}
              {mode === "history" && proof.aiStatus === "SUCCEEDED"
                ? matchBadge(proof.aiTaskMatch)
                : null}
              {proof.aiStatus === "PENDING" ? (
                <Badge variant="outline">AI reading…</Badge>
              ) : null}
              {proof.aiStatus === "FAILED" ? (
                <AiRetryButton proofId={proof.id} />
              ) : null}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pb-3">
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
            {mode === "review" && proof.aiStatus === "SUCCEEDED" ? (
              <Alert>
                <Bot />
                <AlertTitle className="flex flex-wrap items-center gap-2">
                  AI read
                  {matchBadge(proof.aiTaskMatch)}
                </AlertTitle>
                <AlertDescription className="flex flex-col gap-1.5">
                  {proof.aiOneLiner ? (
                    <span className="font-medium text-foreground">
                      {proof.aiOneLiner}
                    </span>
                  ) : null}
                  {proof.aiVisibleEvidence ? (
                    <span>{proof.aiVisibleEvidence}</span>
                  ) : null}
                  {proof.aiUncertainty ? (
                    <span className="text-muted-foreground">
                      Cannot verify: {proof.aiUncertainty}
                    </span>
                  ) : null}
                  {proof.aiReviewerQuestion ? (
                    <span className="font-medium">
                      Worth asking: {proof.aiReviewerQuestion}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    Advisory only. Friends decide.
                  </span>
                </AlertDescription>
              </Alert>
            ) : null}
            {mode === "review" ? (
              proof.ownerId === viewerId ? (
                <Badge variant="secondary" className="w-fit">
                  Your proof — friends decide
                </Badge>
              ) : proof.alreadyReviewed ? (
                <Badge variant="outline" className="w-fit">
                  You already voted
                  {proof.myReview?.note ? ` — “${proof.myReview.note}”` : ""}
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
                  <Item key={review.id} size="sm" variant="muted">
                    <ItemContent>
                      <ItemHeader>
                        <ItemTitle className="text-[13px]">
                          {review.reviewerName}
                        </ItemTitle>
                        <Badge
                          variant={
                            review.decision === "CHALLENGED"
                              ? "destructive"
                              : "default"
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
