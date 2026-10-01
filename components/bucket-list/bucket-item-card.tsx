import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { BucketItemActions } from "@/components/bucket-list/bucket-item-actions";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type BucketItemView,
  describeBucketVote,
} from "@/lib/bucket-list-policy";
import { formatCalendarDate } from "@/lib/time";
import { cn } from "@/lib/utils";

function StatusBadge({ item }: { item: BucketItemView }) {
  if (item.status === "COMPLETED") return <Badge variant="success">Done</Badge>;
  if (item.needsMyVote)
    return (
      <Badge>
        {item.stage === "PROPOSAL" ? "Needs your vote" : "Confirm it"}
      </Badge>
    );
  if (item.stage === "COMPLETION")
    return <Badge variant="secondary">Checking off</Badge>;
  if (item.stage === "PROPOSAL")
    return item.against.length ? (
      <Badge variant="outline">Not everyone’s in</Badge>
    ) : (
      <Badge variant="secondary">Up for a vote</Badge>
    );
  return <Badge variant="outline">On the list</Badge>;
}

export function BucketItemCard({
  item,
  viewerId,
  detail = false,
}: {
  item: BucketItemView;
  viewerId: string;
  detail?: boolean;
}) {
  const href = `/bucket-list/${encodeURIComponent(item.id)}`;
  const vote = describeBucketVote(item, viewerId);
  const shown = item.inFavor.slice(0, 5);
  const Title = detail ? "h1" : "h3";
  return (
    <Card
      size="sm"
      id={detail ? undefined : `item-${item.id}`}
      className={cn("scroll-mt-6", item.needsMyVote && "border-primary/60")}
    >
      <CardHeader>
        <CardTitle
          className={cn(detail && "text-lg font-semibold tracking-[-0.02em]")}
        >
          <Title className="text-pretty">
            {detail ? (
              item.title
            ) : (
              <Link href={href} className="hover:underline">
                {item.title}
              </Link>
            )}
          </Title>
        </CardTitle>
        <CardDescription>
          Proposed by{" "}
          {item.proposer.id === viewerId ? "you" : item.proposer.name} ·{" "}
          {formatCalendarDate(item.createdAt)}
        </CardDescription>
        <CardAction>
          <StatusBadge item={item} />
        </CardAction>
      </CardHeader>
      {item.details && (
        <CardContent>
          <p
            className={cn(
              "text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]",
              !detail && "line-clamp-3",
            )}
          >
            {item.details}
          </p>
        </CardContent>
      )}
      <CardContent className="flex flex-col gap-2">
        {vote ? (
          <>
            <div className="flex items-center gap-2.5">
              {shown.length > 0 && (
                <AvatarGroup>
                  {shown.map((person) => (
                    <Avatar key={person.id} size="sm">
                      <AvatarImage src={person.image ?? undefined} alt="" />
                      <AvatarFallback>{person.initials}</AvatarFallback>
                    </Avatar>
                  ))}
                  {item.inFavor.length > shown.length && (
                    <AvatarGroupCount className="size-6 text-xs">
                      +{item.inFavor.length - shown.length}
                    </AvatarGroupCount>
                  )}
                </AvatarGroup>
              )}
              <p className="text-sm font-medium tabular-nums">{vote.count}</p>
            </div>
            {[vote.requested, vote.waiting, vote.against]
              .filter(Boolean)
              .map((line) => (
                <p key={line} className="text-xs text-muted-foreground">
                  {line}
                </p>
              ))}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {item.status === "COMPLETED" && item.completedAt
              ? `Everyone confirmed · Checked off ${formatCalendarDate(item.completedAt)}`
              : item.approvedAt
                ? `Everyone’s in · On the list since ${formatCalendarDate(item.approvedAt)}`
                : null}
          </p>
        )}
      </CardContent>
      {(item.status !== "COMPLETED" || !detail) && (
        <CardFooter className="gap-2">
          <BucketItemActions item={item} />
          {!detail && (
            <Link
              href={`${href}#comments`}
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground hover:text-foreground"
              aria-label={`${item.replyCount} ${item.replyCount === 1 ? "comment" : "comments"} on ${item.title}`}
            >
              <MessageCircle className="size-4" />
              <span className="tabular-nums">{item.replyCount}</span>
            </Link>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
