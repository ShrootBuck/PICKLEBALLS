"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDateKey } from "@/lib/time";
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
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
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
        Previous
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
          <ChevronRight data-icon="inline-end" />
        </Button>
      ) : null}
      <Input
        type="date"
        aria-label="Timeblock due Monday"
        value={dueMonday}
        max={latestDueMonday}
        onChange={(event) => {
          if (!parseDateKey(event.target.value)) return;
          const monday = nextOrSameMonday(event.target.value);
          if (monday > latestDueMonday || monday === dueMonday) return;
          router.push(
            monday === latestDueMonday
              ? "/timeblock"
              : `/timeblock?due=${monday}`,
          );
        }}
        className="w-full sm:h-8 sm:w-auto"
      />
    </div>
  );
}
