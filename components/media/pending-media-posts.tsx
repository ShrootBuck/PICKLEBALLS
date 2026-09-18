"use client";

import { CircleCheckIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
  const pathname = usePathname();
  const [posts, setPosts] = useState<PendingPost[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Recheck once on navigation because this shell persists across pages.
  useEffect(() => {
    const controller = new AbortController();
    let requestVersion = 0;
    const completed = new Set<string>();
    async function refresh() {
      const version = ++requestVersion;
      try {
        const response = await fetch("/api/media/pending", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const { pending } = (await response.json()) as {
          pending: PendingPost[];
        };
        if (controller.signal.aborted || version !== requestVersion) return;
        setPosts(pending);
        for (const post of pending)
          if (post.proofId && !completed.has(post.id)) {
            completed.add(post.id);
            requestAppRefresh();
          }
      } catch {
        // Try again on navigation or an explicit media action.
      }
    }
    const wake = () => void refresh();
    void refresh();
    window.addEventListener("pb:media-pending", wake);
    return () => {
      controller.abort();
      window.removeEventListener("pb:media-pending", wake);
    };
  }, [pathname]);
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
      if (action === "dismiss") {
        setPosts((current) => current.filter((post) => post.id !== id));
      }
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
      className="flex max-h-[30dvh] shrink-0 flex-col gap-2 overflow-y-auto px-4 pt-3"
      aria-label="Your processing posts"
    >
      {posts.map((post) => (
        <Alert
          key={post.id}
          className="shrink-0"
          variant={post.error ? "destructive" : "default"}
          role={post.error ? "alert" : "status"}
        >
          {post.proofId && <CircleCheckIcon />}
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
              "Your proof will post automatically. Navigate to another page or refresh to check its status."
            )}
            {post.error && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === post.id}
                  onClick={() => void act(post.id, "retry")}
                >
                  Retry processing
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === post.id}
                  onClick={() => void act(post.id, "dismiss")}
                >
                  Remove submission
                </Button>
              </div>
            )}
          </AlertDescription>
          {post.proofId && (
            <AlertAction>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Dismiss posted proof notification"
                disabled={busy === post.id}
                onClick={() => void act(post.id, "dismiss")}
              >
                <XIcon />
              </Button>
            </AlertAction>
          )}
        </Alert>
      ))}
    </aside>
  );
}
