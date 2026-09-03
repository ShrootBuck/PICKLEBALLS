"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function shiftDay(dayKey: string, delta: number) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
}

export function HistoryNav({ day, today }: { day: string; today: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        render={<Link href={`/history?day=${shiftDay(day, -1)}`} prefetch />}
      >
        <ChevronLeft data-icon="inline-start" />
        Prev
      </Button>
      {day !== today ? (
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/history" prefetch />}
        >
          Today
        </Button>
      ) : null}
      {day < today ? (
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/history?day=${shiftDay(day, 1)}`} prefetch />}
        >
          Next
          <ChevronRight data-icon="inline-start" />
        </Button>
      ) : null}
      <Input
        type="date"
        value={day}
        max={today}
        onChange={(event) => {
          const value = event.target.value;
          router.push(
            value && value !== today ? `/history?day=${value}` : "/history",
          );
        }}
        className="h-8 w-auto text-sm"
        aria-label="Pick a day"
      />
    </div>
  );
}
