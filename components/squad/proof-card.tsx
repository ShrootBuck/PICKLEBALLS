import { MediaGallery } from "@/components/media/media-gallery";
import { ProofImageViewer } from "@/components/squad/proof-image-viewer";
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

export type ProofCardData = {
  mediaIds?: string[];
  id: string;
  title: string;
  ownerName: string;
  ownerNote: string | null;
  isLate: boolean;
  submittedAt: string;
  expired: boolean;
  challenge: ThreadReply | null;
  replies: ThreadReply[];
};

export function ProofCard({
  proof,
  viewerId,
}: {
  proof: ProofCardData;
  viewerId: string;
}) {
  const meta = [proof.ownerName, proof.isLate ? "late" : "on time"].join("; ");

  return (
    <Card size="sm" className="gap-0 py-0">
      <div className="flex flex-col items-stretch sm:flex-row">
        {proof.mediaIds?.length ? (
          <div className="w-full shrink-0 md:w-80">
            <MediaGallery ids={proof.mediaIds} />
          </div>
        ) : (
          <ProofImageViewer proofId={proof.id} title={proof.title} compact />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <CardHeader className="py-3 sm:pr-3">
            <CardTitle className="leading-snug">{proof.title}</CardTitle>
            <CardDescription>{meta}</CardDescription>
            <CardAction className="flex flex-col items-end gap-1">
              {proof.expired ? (
                <Badge variant="destructive">Expired</Badge>
              ) : proof.challenge ? (
                <Badge variant="destructive">Challenged</Badge>
              ) : (
                <Badge variant="success">Done</Badge>
              )}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pb-3">
            {proof.ownerNote ? (
              <p className="line-clamp-2 text-sm text-pretty text-muted-foreground">
                “{proof.ownerNote}”
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatProofTime(proof.submittedAt)}
            </p>
            <Separator />
            <SocialReplyThread
              contextLabel={`Commenting on ${proof.ownerName}'s proof: ${proof.title}`}
              targetType="PROOF"
              targetId={proof.id}
              initialReplies={[...proof.replies]
                .sort(
                  (a, b) =>
                    b.createdAt.localeCompare(a.createdAt) ||
                    b.id.localeCompare(a.id),
                )
                .slice(0, 50)}
              initialChallenges={proof.challenge ? [proof.challenge] : []}
              currentUserId={viewerId}
              compact
            />
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
