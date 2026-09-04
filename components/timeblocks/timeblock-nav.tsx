"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nextOrSameMonday, shiftDateKey } from "@/lib/timeblocks";

export function TimeblockNav({
  dueMonday,
  latestDueMonday,
}: {
  dueMonday: string;
  latestDueMonday: string;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        render={
          <Link
            href={`/timeblock?due=${shiftDateKey(dueMonday, -7)}`}
            prefetch
          />
        }
      >
        <ChevronLeft data-icon="inline-start" />
        Prev
      </Button>
      {dueMonday !== latestDueMonday ? (
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/timeblock" prefetch />}
        >
          Current
        </Button>
      ) : null}
      {dueMonday < latestDueMonday ? (
        <Button
          variant="outline"
          size="sm"
          render={
            <Link
              href={`/timeblock?due=${shiftDateKey(dueMonday, 7)}`}
              prefetch
            />
          }
        >
          Next
          <ChevronRight data-icon="inline-start" />
        </Button>
      ) : null}
      <Input
        type="date"
        aria-label="Timeblock due Monday"
        value={dueMonday}
        max={latestDueMonday}
        onChange={(event) => {
          if (!event.target.value) return;
          const monday = nextOrSameMonday(event.target.value);
          router.push(
            monday === latestDueMonday
              ? "/timeblock"
              : `/timeblock?due=${monday}`,
          );
        }}
        className="h-8 w-auto min-w-36 text-xs"
      />
    </div>
  );
}
