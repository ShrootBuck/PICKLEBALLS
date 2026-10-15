"use client";

import { Camera, MessageCircle } from "lucide-react";
import { useSocial } from "@/components/social/social-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function FeedPrompt() {
  const { viewer, openComposer } = useSocial();
  return (
    <section aria-label="Share with your circle" className="feed-prompt">
      <div className="feed-prompt-top">
        <Avatar className="size-9">
          <AvatarImage
            userId={viewer.id}
            src={viewer.image ?? undefined}
            alt=""
          />
          <AvatarFallback>{viewer.initials}</AvatarFallback>
        </Avatar>
        <Button
          variant="plain"
          className="feed-prompt-input"
          onClick={() => openComposer()}
        >
          <span className="truncate">What did you get done?</span>
        </Button>
      </div>
      <div className="feed-prompt-actions">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Post proof"
          onClick={() => openComposer({ mode: "proof" })}
        >
          <Camera data-icon="inline-start" /> Post proof
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Check in"
          onClick={() => openComposer({ mode: "check-in" })}
        >
          <MessageCircle data-icon="inline-start" /> Check in
        </Button>
      </div>
    </section>
  );
}
