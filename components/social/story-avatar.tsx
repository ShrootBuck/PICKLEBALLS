"use client";
import Link from "next/link";
import { useSocial } from "@/components/social/social-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { SocialAuthor } from "@/lib/social-types";
import { storyFrames } from "@/lib/stories";
import { cn } from "@/lib/utils";

export function StoryAvatar({
  author,
  href,
}: {
  author: SocialAuthor;
  href: string;
}) {
  const { stories, storiesReady, openStories } = useSocial();
  const group = stories.find((story) => story.author.id === author.id);
  const avatar = (
    <Avatar className="size-10">
      <AvatarImage src={author.image ?? undefined} alt="" />
      <AvatarFallback>{author.initials}</AvatarFallback>
    </Avatar>
  );
  return group ? (
    <Button
      variant="plain"
      type="button"
      disabled={!storiesReady}
      className={cn(
        "story-ring story-ring-small has-story",
        storyFrames(group).some((frame) => !frame.seen) && "is-unseen",
      )}
      aria-label={`View ${author.name}’s story`}
      onClick={(event) => openStories(author.id, event.currentTarget)}
    >
      {avatar}
    </Button>
  ) : (
    <Link href={href} aria-label={`${author.name}’s profile`}>
      {avatar}
    </Link>
  );
}
