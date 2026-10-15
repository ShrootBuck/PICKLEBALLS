import type { Metadata } from "next";
import { MessagesInbox } from "@/components/messages/messages-inbox";
import { directContacts, directInbox } from "@/lib/direct-messages";
import { requireSession } from "@/lib/request";

export const metadata: Metadata = { title: "Messages" };
export default async function MessagesPage() {
  const { session } = await requireSession();
  const [inbox, contacts] = await Promise.all([
    directInbox(session.user.id),
    directContacts(session.user.id),
  ]);
  return (
    <MessagesInbox
      key={session.user.id}
      viewerId={session.user.id}
      initialInbox={inbox}
      contacts={contacts}
    />
  );
}
