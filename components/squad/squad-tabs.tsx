"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SquadTabs({
  defaultTab,
  verdictCount,
  proofCount,
  verdicts,
  board,
  proof,
  log,
}: {
  defaultTab: "verdicts" | "board";
  verdictCount: number;
  proofCount: number;
  verdicts: ReactNode;
  board: ReactNode;
  proof: ReactNode;
  log: ReactNode;
}) {
  return (
    <Tabs defaultValue={defaultTab} className="gap-4">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="verdicts" className="gap-1.5">
          Verdicts
          {verdictCount > 0 ? (
            <Badge variant="secondary" className="tabular-nums">
              {verdictCount}
            </Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="board">Board</TabsTrigger>
        <TabsTrigger value="proof" className="gap-1.5">
          Proof
          {proofCount > 0 ? (
            <Badge variant="secondary" className="tabular-nums">
              {proofCount}
            </Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="log">Log</TabsTrigger>
      </TabsList>
      <TabsContent value="verdicts">{verdicts}</TabsContent>
      <TabsContent value="board">{board}</TabsContent>
      <TabsContent value="proof">{proof}</TabsContent>
      <TabsContent value="log">{log}</TabsContent>
    </Tabs>
  );
}
