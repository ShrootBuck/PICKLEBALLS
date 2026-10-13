"use client";

import { Camera, MessageCircle } from "lucide-react";
import { useSocial } from "@/components/social/social-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function FeedPrompt() {
  const { viewer, openComposer } = useSocial();
  return (
    <section aria-label="Share with your circle" className="feed-prompt">
      <Avatar className="size-10">
        <AvatarImage src={viewer.image ?? undefined} alt="" />
        <AvatarFallback>{viewer.initials}</AvatarFallback>
      </Avatar>
      <Button
        variant="plain"
        className="feed-prompt-input"
        onClick={() => openComposer()}
      >
        <span className="truncate">What did you get done?</span>
      </Button>
      <div className="flex shrink-0 gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Post proof"
          onClick={() => openComposer({ mode: "proof" })}
        >
          <Camera />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Check in"
          onClick={() => openComposer({ mode: "check-in" })}
        >
          <MessageCircle />
        </Button>
      </div>
    </section>
  );
}
