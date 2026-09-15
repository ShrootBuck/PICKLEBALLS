"use client";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { SocialAuthor } from "@/lib/social-types";

export function PostAvatar({
  author,
  href,
}: {
  author: SocialAuthor;
  href: string;
}) {
  const avatar = (
    <Avatar className="size-10">
      <AvatarImage src={author.image ?? undefined} alt="" />
      <AvatarFallback>{author.initials}</AvatarFallback>
    </Avatar>
  );
  return (
    <Link href={href} aria-label={`${author.name}’s profile`}>
      {avatar}
    </Link>
  );
}
