"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSocial } from "@/components/social/social-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { storyFrames } from "@/lib/stories";
import { cn } from "@/lib/utils";

export function StoryTray() {
  const { viewer, stories, storiesReady, openStories, openComposer } =
    useSocial();
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ before: false, after: false });
  const mine = stories.find((group) => group.author.id === viewer.id);
  const others = stories.filter((group) => group.author.id !== viewer.id);
  const unseen = others.filter((group) =>
    storyFrames(group).some((frame) => !frame.seen),
  ).length;
  const measure = useCallback(() => {
    const node = scroller.current;
    if (node)
      setEdges({
        before: node.scrollLeft > 2,
        after: node.scrollLeft + node.clientWidth < node.scrollWidth - 2,
      });
  }, []);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [measure]);
  function scroll(direction: number) {
    scroller.current?.scrollBy({
      left: direction * 240,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <section aria-label="Stories" className="story-tray">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Stories{" "}
          <span className="ml-1 font-normal text-muted-foreground">· 24h</span>
        </h2>
        <span className="text-xs text-muted-foreground">
          {unseen
            ? `${unseen} new ${unseen === 1 ? "story" : "stories"}`
            : others.length
              ? "You’re caught up"
              : "A little of everyone’s day"}
        </span>
      </div>
      <div className="relative">
        <div ref={scroller} onScroll={measure} className="story-strip">
          <div className="story-strip-items">
            <div className="story-person">
              <div className="relative">
                <Button
                  variant="plain"
                  type="button"
                  className="story-avatar-button"
                  disabled={!storiesReady}
                  aria-label={mine ? "View your story" : "Add to your story"}
                  onClick={(event) =>
                    mine
                      ? openStories(viewer.id, event.currentTarget)
                      : openComposer({ mode: "story", source: "story" })
                  }
                >
                  <span
                    className={cn("story-ring", mine && "has-story", "is-own")}
                  >
                    <Avatar className="size-16">
                      <AvatarImage src={viewer.image ?? undefined} alt="" />
                      <AvatarFallback>{viewer.initials}</AvatarFallback>
                    </Avatar>
                  </span>
                </Button>
                <Button
                  variant="plain"
                  type="button"
                  className="story-add"
                  disabled={!storiesReady}
                  aria-label="Add to your story"
                  onClick={() =>
                    openComposer({ mode: "story", source: "story" })
                  }
                >
                  <Plus className="size-4" />
                </Button>
              </div>
              <span className="story-name">Your story</span>
              <span className="story-note">
                {mine ? "Add more" : "Share your day"}
              </span>
            </div>
            {others.map((group) => {
              const fresh = storyFrames(group).some((frame) => !frame.seen);
              return (
                <Button
                  variant="plain"
                  type="button"
                  className="story-person story-person-button"
                  disabled={!storiesReady}
                  key={group.author.id}
                  aria-label={`View ${group.author.name}’s story${fresh ? ", unseen" : ", seen"}`}
                  onClick={(event) =>
                    openStories(group.author.id, event.currentTarget)
                  }
                >
                  <span
                    className={cn("story-ring has-story", fresh && "is-unseen")}
                  >
                    <Avatar className="size-16">
                      <AvatarImage
                        src={group.author.image ?? undefined}
                        alt=""
                      />
                      <AvatarFallback>{group.author.initials}</AvatarFallback>
                    </Avatar>
                  </span>
                  <span className="story-name">
                    {group.author.name.split(" ")[0]}
                  </span>
                  <span className={cn("story-note", fresh && "is-unseen")}>
                    {fresh ? "New" : "Seen"}
                  </span>
                </Button>
              );
            })}
            {!others.length && (
              <p className="story-tray-empty">
                Your circle’s proof and check-ins appear here.
                <br />
                <span>Give them something to catch up on.</span>
              </p>
            )}
          </div>
        </div>
        {edges.before && (
          <Button
            variant="secondary"
            size="icon-sm"
            className="story-scroll-arrow left-0"
            aria-label="Scroll stories left"
            onClick={() => scroll(-1)}
          >
            <ChevronLeft />
          </Button>
        )}
        {edges.after && (
          <Button
            variant="secondary"
            size="icon-sm"
            className="story-scroll-arrow right-0"
            aria-label="Scroll stories right"
            onClick={() => scroll(1)}
          >
            <ChevronRight />
          </Button>
        )}
      </div>
    </section>
  );
}
