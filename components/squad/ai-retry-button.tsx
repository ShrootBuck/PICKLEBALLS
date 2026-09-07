"use client";

import { Bot } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { proofFetch } from "@/lib/proof-fetch";

export function AiRetryButton({ proofId }: { proofId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function retry() {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      const response = await proofFetch(
        `/api/proofs/${proofId}/assess`,
        { method: "POST" },
        () => setPending(false),
      );
      if (!response.ok) {
        setError(true);
        setPending(false);
        return;
      }
      toast.add({
        title: "AI is reading it again. The result will appear automatically.",
        type: "success",
      });
    } catch {
      setError(true);
      setPending(false);
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline">{pending ? "AI reading…" : "AI flopped"}</Badge>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 min-h-0 px-1.5 text-[11px]"
        disabled={pending}
        onClick={retry}
      >
        {pending ? <Spinner data-icon="inline-start" /> : <Bot />}
        {pending ? "Reading…" : error ? "Try again" : "Retry AI read"}
      </Button>
    </span>
  );
}
