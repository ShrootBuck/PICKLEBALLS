import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { memberHref } from "@/lib/navigation";
import type { SocialMember } from "@/lib/social-types";
import { cn } from "@/lib/utils";

export function MemberProgress({
  members,
  viewerId,
  circleId,
}: {
  members: SocialMember[];
  viewerId: string;
  circleId: string;
}) {
  const ordered = [...members].sort(
    (a, b) => Number(b.id === viewerId) - Number(a.id === viewerId),
  );
  return (
    <nav aria-label="Today’s tasks by member" className="friends-strip">
      {ordered.map((member) => {
        const verified = member.tasks.filter(
          (task) => task.status === "VERIFIED",
        ).length;
        const total = member.tasks.length;
        return (
          <Link
            key={member.id}
            href={
              member.id === viewerId
                ? "/profile?tab=tasks"
                : memberHref(circleId, member.id, "tasks")
            }
            className="friend-item"
            aria-label={`${member.id === viewerId ? "Your tasks" : `${member.name}’s tasks`}: ${verified} of ${total} verified today`}
          >
            <span
              className={cn(
                "friend-ring",
                total > 0 && verified === total && "is-complete",
              )}
            >
              <Avatar className="size-14">
                <AvatarImage src={member.image ?? undefined} alt="" />
                <AvatarFallback>{member.initials}</AvatarFallback>
              </Avatar>
            </span>
            <span className="w-full truncate text-center text-xs font-medium">
              {member.id === viewerId ? "You" : member.name.split(" ")[0]}
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {total ? `${verified}/${total} done` : "No tasks"}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
