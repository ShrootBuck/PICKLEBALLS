"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { requestAppRefresh } from "@/lib/app-refresh";
import { postHref } from "@/lib/navigation";

type PendingPost = {
  id: string;
  proofId: string | null;
  error: string | null;
  progress: number;
};
export function PendingMediaPosts({ circleId }: { circleId: string }) {
  const [posts, setPosts] = useState<PendingPost[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let active = false;
    const completed = new Set<string>();
    async function refresh() {
      try {
        const response = await fetch("/api/media/pending", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const { pending } = (await response.json()) as {
          pending: PendingPost[];
        };
        if (cancelled) return;
        setPosts(pending);
        active = pending.some((post) => !post.proofId && !post.error);
        for (const post of pending)
          if (post.proofId && !completed.has(post.id)) {
            completed.add(post.id);
            requestAppRefresh();
          }
      } catch {
        /* Retry after temporary connection failures. */
      } finally {
        if (!cancelled)
          timer = setTimeout(
            refresh,
            document.hidden ? 60_000 : active ? 5000 : 30_000,
          );
      }
    }
    const wake = () => {
      clearTimeout(timer);
      void refresh();
    };
    void refresh();
    window.addEventListener("pb:media-pending", wake);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("pb:media-pending", wake);
    };
  }, []);
  async function act(id: string, action: "retry" | "dismiss") {
    setBusy(id);
    try {
      const response = await fetch("/api/media/pending", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.dispatchEvent(new Event("pb:media-pending"));
    } catch (error) {
      toast.add({
        title:
          error instanceof Error ? error.message : "Could not update the post.",
        type: "error",
      });
    } finally {
      setBusy(null);
    }
  }
  if (!posts.length) return null;
  return (
    <aside
      className="flex flex-col gap-2 px-4 pt-3"
      aria-label="Your processing posts"
    >
      {posts.map((post) => (
        <Alert key={post.id} variant={post.error ? "destructive" : "default"}>
          {!post.error && !post.proofId && <Spinner />}
          <AlertTitle>
            {post.proofId
              ? "Your proof is posted"
              : post.error
                ? "Your proof needs attention"
                : `Preparing your proof: ${post.progress}%`}
          </AlertTitle>
          <AlertDescription>
            {post.proofId ? (
              <Link
                className="underline"
                href={postHref(circleId, "proof", post.proofId)}
              >
                View post
              </Link>
            ) : (
              post.error ||
              "You can leave this screen. Your friends will see the post when every attachment is ready."
            )}
            {(post.error || post.proofId) && (
              <div className="flex gap-2 pt-2">
                {post.error && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === post.id}
                    onClick={() => void act(post.id, "retry")}
                  >
                    Retry processing
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === post.id}
                  onClick={() => void act(post.id, "dismiss")}
                >
                  {post.proofId ? "Dismiss" : "Remove submission"}
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </aside>
  );
}
