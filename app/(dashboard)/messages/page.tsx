import type { Metadata } from "next";
import { MessagesInbox } from "@/components/messages/messages-inbox";
import { directInbox } from "@/lib/direct-messages";
import { requirePageMembership } from "@/lib/request";

export const metadata: Metadata = { title: "Messages" };
export default async function MessagesPage() {
  const { session, membership } = await requirePageMembership();
  const inbox = await directInbox(session.user.id, membership.circleId);
  return (
    <MessagesInbox
      key={`${session.user.id}:${membership.circleId}`}
      viewerId={session.user.id}
      circleName={membership.circle.name}
      initialInbox={inbox}
    />
  );
}
