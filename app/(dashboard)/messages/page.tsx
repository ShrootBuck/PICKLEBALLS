import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleDestination } from "@/components/circles/circle-destination";
import { MessagesInbox } from "@/components/messages/messages-inbox";
import { directInbox } from "@/lib/direct-messages";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";

export const metadata: Metadata = { title: "Messages" };
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ circle?: string; chat?: string }>;
}) {
  const { session, membership } = await requirePageMembership();
  const params = await searchParams;
  const chat = typeof params.chat === "string" ? params.chat : undefined;
  if (
    typeof params.circle === "string" &&
    params.circle !== membership.circleId
  ) {
    const allowed = await getPrisma().membership.findUnique({
      where: {
        userId_circleId: { userId: session.user.id, circleId: params.circle },
      },
    });
    if (!allowed) notFound();
    return (
      <CircleDestination
        circleId={params.circle}
        destination={
          chat ? `/messages?${new URLSearchParams({ chat })}` : "/messages"
        }
      />
    );
  }
  const inbox = await directInbox(session.user.id, membership.circleId, chat);
  return (
    <MessagesInbox
      key={`${session.user.id}:${membership.circleId}`}
      viewerId={session.user.id}
      initialInbox={inbox}
      initialNow={new Date().toISOString()}
    />
  );
}
