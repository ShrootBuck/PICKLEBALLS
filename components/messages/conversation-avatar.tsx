import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ConversationDetails } from "@/lib/direct-message-types";
import { cn } from "@/lib/utils";

export function ConversationAvatar({
  chat,
  className,
}: {
  chat: ConversationDetails;
  className?: string;
}) {
  if (chat.kind === "group")
    return (
      <span className={cn("dm-group-avatar", className)} aria-hidden="true">
        <Users />
      </span>
    );
  return (
    <Avatar className={cn("dm-avatar", className)}>
      <AvatarImage
        userId={chat.person.id}
        src={chat.person.image ?? undefined}
        alt=""
      />
      <AvatarFallback>{chat.person.initials}</AvatarFallback>
    </Avatar>
  );
}
