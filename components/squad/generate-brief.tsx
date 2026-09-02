"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function GenerateBrief() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const response = await fetch("/api/ai/squad-digest", {
          method: "POST",
        });
        const body = (await response.json()) as {
          error?: string;
          cached?: boolean;
        };
        toast.add({
          title: response.ok
            ? body.cached
              ? "Today’s brief was already cached."
              : "Squad brief generated."
            : (body.error ?? "AI brief failed."),
          type: response.ok ? "success" : "error",
        });
        setPending(false);
        router.refresh();
      }}
    >
      {pending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <Sparkles data-icon="inline-start" />
      )}
      Generate daily brief
    </Button>
  );
}
