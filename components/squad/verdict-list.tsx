"use client";

import { ClockAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { ProofCard, type ProofCardData } from "@/components/squad/proof-card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function VerdictList({
  initial,
  viewerId,
  focusId,
}: {
  initial: ProofCardData[];
  viewerId: string;
  focusId?: string;
}) {
  // Local-first verdicts: a submitted review drops the card instantly
  // instead of a full-page refresh.
  const [proofs, setProofs] = useState(initial);
  useEffect(() => {
    setProofs(initial);
  }, [initial]);
  if (proofs.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClockAlert />
          </EmptyMedia>
          <EmptyTitle>Nothing to judge</EmptyTitle>
          <EmptyDescription>
            Either everyone is grinding or nobody posted shit. Very different
            situations.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {proofs.map((proof) => (
        <ProofCard
          key={proof.id}
          proof={proof}
          viewerId={viewerId}
          mode="review"
          focusId={focusId}
          onReviewed={(id) =>
            setProofs((prev) => prev.filter((item) => item.id !== id))
          }
        />
      ))}
    </div>
  );
}
