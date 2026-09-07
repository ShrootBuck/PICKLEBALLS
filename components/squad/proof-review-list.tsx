import { Fragment } from "react";
import {
  SocialReplyThread,
  type ThreadReply,
} from "@/components/squad/social-reply-thread";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
} from "@/components/ui/item";

type Review = {
  id: string;
  decision: "APPROVED" | "CHALLENGED";
  note: string | null;
  reviewerName: string;
  reviewerId?: string;
  replies: ThreadReply[];
};

export function ProofReviewList({
  reviews,
  currentUserId,
  focusId,
}: {
  reviews: Review[];
  currentUserId: string;
  focusId?: string;
}) {
  return (
    <ItemGroup className="gap-0 has-data-[size=sm]:gap-0">
      {reviews.map((review, index) => (
        <Fragment key={review.id}>
          {index > 0 ? <ItemSeparator /> : null}
          <Item size="sm" className="items-start px-0 py-1">
            <ItemMedia>
              <Avatar>
                <AvatarFallback>
                  {review.reviewerName
                    .trim()
                    .split(/\s+/)
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </AvatarFallback>
              </Avatar>
            </ItemMedia>
            <ItemContent>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="break-words text-sm font-medium">
                  {review.reviewerName}
                  {review.reviewerId === currentUserId ? " (you)" : ""}
                </span>
                <Badge
                  variant={
                    review.decision === "CHALLENGED" ? "destructive" : "success"
                  }
                >
                  {review.decision === "CHALLENGED" ? "Challenged" : "Approved"}
                </Badge>
              </div>
              {review.note ? (
                <p className="whitespace-pre-wrap break-words text-sm">
                  {review.note}
                </p>
              ) : null}
              <SocialReplyThread
                targetType="REVIEW"
                targetId={review.id}
                contextLabel={`Replying to ${review.reviewerName}'s review`}
                replyLabel={`Reply to ${review.reviewerName}`}
                initialReplies={review.replies}
                currentUserId={currentUserId}
                compact
                defaultExpanded={focusId === review.id}
              />
            </ItemContent>
          </Item>
        </Fragment>
      ))}
    </ItemGroup>
  );
}
