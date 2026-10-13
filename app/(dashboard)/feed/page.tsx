import { ArrowRight, CheckCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Feed } from "@/components/social/feed";
import { FeedPrompt } from "@/components/social/feed-prompt";
import { requirePageMembership } from "@/lib/request";
import { countProofsAwaitingVerdict, getFeedPage } from "@/lib/social-data";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage() {
  const { session, membership } = await requirePageMembership();
  const context = { viewerId: session.user.id, circleId: membership.circleId };
  const [feed, verdicts] = await Promise.all([
    getFeedPage({ ...context, timelineOnly: true }),
    countProofsAwaitingVerdict(membership.circleId, session.user.id),
  ]);
  return (
    <>
      <h1 className="sr-only">Feed</h1>
      <FeedPrompt />
      {verdicts > 0 && (
        <Link href="/squad" className="feed-review-banner">
          <CheckCheck className="size-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <strong className="font-semibold">
              {verdicts} {verdicts === 1 ? "proof is" : "proofs are"} waiting
              for your verdict
            </strong>
            <span className="block text-xs text-muted-foreground">
              They stay out of the feed until you review them.
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0" />
        </Link>
      )}
      <Feed initial={feed} timelineOnly />
    </>
  );
}
