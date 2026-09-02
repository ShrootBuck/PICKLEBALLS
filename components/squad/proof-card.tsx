import { Bot } from "lucide-react";
import Image from "next/image";
import { ReviewProof } from "@/components/squad/review-proof";
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
import { cn } from "@/lib/utils";

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
  alreadyReviewed: boolean;
  aiStatus: "PENDING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  aiVisibleEvidence: string | null;
  aiReviewerQuestion: string | null;
};

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Phoenix",
  dateStyle: "short",
  timeStyle: "short",
});

function statusBadge(status: ProofCardData["reviewStatus"]) {
  if (status === "APPROVED") return <Badge>Verified</Badge>;
  if (status === "CHALLENGED")
    return <Badge variant="destructive">Challenged</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

export function ProofCard({
  proof,
  viewerId,
  mode,
}: {
  proof: ProofCardData;
  viewerId: string;
  mode: "review" | "history";
}) {
  const compact = mode === "history";
  const meta = [
    proof.ownerName,
    proof.isLate ? "late" : "on time",
    `${proof.approvals}/2 approvals`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card size="sm" className="gap-0 py-0">
      <div
        className={cn(
          "flex",
          compact ? "flex-row items-stretch" : "flex-col md:flex-row",
        )}
      >
        <div
          className={cn(
            "relative shrink-0 overflow-hidden bg-muted",
            compact
              ? "size-24 sm:size-28"
              : "h-44 w-full md:h-auto md:w-56 md:min-h-44",
          )}
        >
          <Image
            className="object-cover"
            src={`/api/proofs/${proof.id}/image`}
            alt={`Proof for ${proof.title}`}
            fill
            sizes={compact ? "112px" : "(max-width: 768px) 100vw, 224px"}
            unoptimized
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <CardHeader className={cn("py-3", compact && "pr-3")}>
            <CardTitle className="truncate">{proof.title}</CardTitle>
            <CardDescription className="truncate">{meta}</CardDescription>
            <CardAction>{statusBadge(proof.reviewStatus)}</CardAction>
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
                {timeFormatter.format(new Date(proof.submittedAt))}
              </p>
            ) : null}
            {mode === "review" && proof.aiStatus === "SUCCEEDED" ? (
              <Alert>
                <Bot />
                <AlertTitle>AI read</AlertTitle>
                <AlertDescription>
                  {proof.aiVisibleEvidence}
                  {proof.aiReviewerQuestion
                    ? ` Question: ${proof.aiReviewerQuestion}`
                    : ""}
                </AlertDescription>
              </Alert>
            ) : null}
            {mode === "review" ? (
              proof.ownerId === viewerId ? (
                <Badge variant="secondary" className="w-fit">
                  You cannot review your own proof
                </Badge>
              ) : proof.alreadyReviewed ? (
                <Badge variant="outline" className="w-fit">
                  You already reviewed
                </Badge>
              ) : (
                <ReviewProof proofId={proof.id} taskTitle={proof.title} />
              )
            ) : null}
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
