import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageAvatar } from "@/components/ui/message";
import type { DirectPerson } from "@/lib/direct-message-types";

export function MessageSenderAvatar({
  sender,
}: {
  sender: DirectPerson | null;
}) {
  return (
    <MessageAvatar className="dm-message-avatar">
      <Avatar role="img" aria-label={sender?.name ?? "Deleted member"}>
        <AvatarImage
          userId={sender?.id}
          src={sender?.image ?? undefined}
          alt=""
        />
        <AvatarFallback>{sender?.initials || "?"}</AvatarFallback>
      </Avatar>
    </MessageAvatar>
  );
}
