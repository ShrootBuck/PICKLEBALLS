"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDateKey } from "@/lib/time";
import { shiftDateKey } from "@/lib/timeblocks";

export function ProfileDayPicker({
  base,
  circleId,
  day,
  today,
}: {
  base: string;
  circleId: string;
  day: string;
  today: string;
}) {
  const router = useRouter();
  const href = (date: string) =>
    `${base}?${new URLSearchParams({ circle: circleId, tab: "tasks", day: date })}`;
  return (
    <nav
      className="flex min-w-0 flex-wrap items-center gap-1"
      aria-label="Task date"
    >
      <Link
        href={href(shiftDateKey(day, -1))}
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        aria-label="Previous day"
      >
        <ChevronLeft />
      </Link>
      <Input
        type="date"
        aria-label="View tasks on a date"
        value={day}
        max={today}
        className="w-auto"
        onChange={(e) => {
          if (
            parseDateKey(e.target.value) &&
            e.target.value <= today &&
            e.target.value !== day
          )
            router.push(href(e.target.value));
        }}
      />
      {day < today ? (
        <>
          <Link
            href={href(shiftDateKey(day, 1))}
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            aria-label="Next day"
          >
            <ChevronRight />
          </Link>
          <Link
            href={href(today)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Today
          </Link>
        </>
      ) : (
        <Button variant="ghost" size="icon-sm" aria-label="Next day" disabled>
          <ChevronRight />
        </Button>
      )}
    </nav>
  );
}
