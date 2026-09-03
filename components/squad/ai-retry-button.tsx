"use client";

import { Bot } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function AiRetryButton({ proofId }: { proofId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function retry() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch(`/api/proofs/${proofId}/assess`, {
        method: "POST",
      });
      if (!response.ok) {
        setError(true);
        setPending(false);
        return;
      }
      toast.add({ title: "AI read it. Fresh take below.", type: "success" });
      router.refresh();
    } catch {
      setError(true);
      setPending(false);
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline">AI flopped</Badge>
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
