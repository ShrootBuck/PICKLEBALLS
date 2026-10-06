import { Mountain } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BucketItemCard } from "@/components/bucket-list/bucket-item-card";
import { ProposeIdea } from "@/components/bucket-list/propose-idea";
import { CircleDestination } from "@/components/circles/circle-destination";
import { PageHeader, PageSection } from "@/components/layout/page-header";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getBucketList } from "@/lib/bucket-list-data";
import {
  type BucketItemView,
  groupBucketItems,
} from "@/lib/bucket-list-policy";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";

export const metadata: Metadata = { title: "Bucket list" };

export default async function BucketListPage({
  searchParams,
}: {
  searchParams: Promise<{ circle?: string }>;
}) {
  const { session, membership } = await requirePageMembership();
  const params = await searchParams;
  if (
    typeof params.circle === "string" &&
    params.circle !== membership.circleId
  ) {
    const destination = await getPrisma().membership.findUnique({
      where: {
        userId_circleId: { userId: session.user.id, circleId: params.circle },
      },
      select: { circleId: true },
    });
    if (!destination) notFound();
    return (
      <CircleDestination
        circleId={destination.circleId}
        destination="/bucket-list"
      />
    );
  }
  const circleId = membership.circleId;
  const { items, memberCount } = await getBucketList(circleId, session.user.id);
  const { voting, list, done } = groupBucketItems(items);
  const card = (item: BucketItemView) => (
    <BucketItemCard key={item.id} item={item} viewerId={session.user.id} />
  );
  return (
    <>
      <PageHeader
        title="Bucket list"
        description="Share ideas, make plans, and go with whoever can make it. Only participants confirm completion."
        actions={<ProposeIdea circleId={circleId} memberCount={memberCount} />}
      />
      {items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Mountain />
            </EmptyMedia>
            <EmptyTitle>No big ideas yet</EmptyTitle>
            <EmptyDescription>
              Skydiving, a road trip, a concert you’d never go to alone. Propose
              one and see who’s in.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {voting.length > 0 && (
            <PageSection
              title="Ideas and upcoming plans"
              description="Show interest, then RSVP when there is a date."
            >
              {voting.map(card)}
            </PageSection>
          )}
          <PageSection
            title="Ready to go"
            description="These plans have enough people going."
          >
            {list.length ? (
              list.map(card)
            ) : (
              <p className="text-sm text-muted-foreground">
                No plans have reached their attendance requirement yet.
              </p>
            )}
          </PageSection>
          {done.length > 0 && (
            <PageSection
              title="Done"
              description="Checked off by the people who participated."
            >
              {done.map(card)}
            </PageSection>
          )}
        </>
      )}
    </>
  );
}
