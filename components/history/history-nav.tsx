"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDateKey } from "@/lib/time";

function shiftDay(dayKey: string, delta: number) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
}

export function HistoryNav({ day, today }: { day: string; today: string }) {
  const router = useRouter();
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
      <Button
        nativeButton={false}
        variant="outline"
        size="sm"
        render={<Link href={`/history?day=${shiftDay(day, -1)}`} prefetch />}
      >
        <ChevronLeft data-icon="inline-start" />
        Previous
      </Button>
      {day !== today ? (
        <Button
          nativeButton={false}
          variant="outline"
          size="sm"
          render={<Link href="/history" prefetch />}
        >
          Today
        </Button>
      ) : null}
      {day < today ? (
        <Button
          nativeButton={false}
          variant="outline"
          size="sm"
          render={<Link href={`/history?day=${shiftDay(day, 1)}`} prefetch />}
        >
          Next
          <ChevronRight data-icon="inline-end" />
        </Button>
      ) : null}
      <Input
        type="date"
        value={day}
        max={today}
        onChange={(event) => {
          const value = event.target.value;
          if (!parseDateKey(value) || value > today || value === day) return;
          router.push(value !== today ? `/history?day=${value}` : "/history");
        }}
        className="w-full sm:h-8 sm:w-auto"
        aria-label="Pick a day"
      />
    </div>
  );
}
