"use client";

import { useState } from "react";
import { Feed } from "@/components/social/feed";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FeedPage } from "@/lib/social-types";

export function HomeFeed({
  timeline,
  pending,
}: {
  timeline: FeedPage;
  pending: FeedPage;
}) {
  const [selection, setSelection] = useState<string | null>(null);
  const value = selection ?? (pending.items.length ? "pending" : "timeline");
  return (
    <Tabs value={value} onValueChange={(next) => setSelection(String(next))}>
      <TabsList variant="line" className="w-full" aria-label="Home feeds">
        <TabsTrigger value="pending">Needs approval</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
      </TabsList>
      <TabsContent value="pending">
        <Feed key="pending" initial={pending} awaitingOnly />
      </TabsContent>
      <TabsContent value="timeline">
        <Feed key="timeline" initial={timeline} timelineOnly />
      </TabsContent>
    </Tabs>
  );
}
