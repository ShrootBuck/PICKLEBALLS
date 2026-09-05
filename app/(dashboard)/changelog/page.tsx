import "katex/dist/katex.min.css";
import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { ChangelogMarkdown } from "@/components/changelog-markdown";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { type ChangelogEntry, changelogEntries } from "@/lib/changelog";

export const metadata: Metadata = { title: "Changelog" };

// The circle runs on Phoenix days, which never observe DST, so grouping by
// America/Phoenix renders identically on server and client with no hydration
// mismatch and no 24h-arithmetic edge cases.
const TIME_ZONE = "America/Phoenix";

const dayParts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dayKey(timestamp: number) {
  const parts = Object.fromEntries(
    dayParts.formatToParts(timestamp).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dayLabel(firstTimestamp: number, now: number) {
  const key = dayKey(firstTimestamp);
  if (key === dayKey(now)) return "Today";
  // Safe: Phoenix has no daylight saving, so minus 24h is always yesterday.
  if (key === dayKey(now - 24 * 60 * 60 * 1000)) return "Yesterday";
  const sameYear =
    dayKey(firstTimestamp).slice(0, 4) === dayKey(now).slice(0, 4);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  }).format(firstTimestamp);
}

type DayGroup = { key: string; label: string; entries: ChangelogEntry[] };

function groupByDay(entries: ChangelogEntry[], now: number): DayGroup[] {
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);
  const groups: DayGroup[] = [];
  for (const entry of sorted) {
    const key = dayKey(entry.timestamp);
    const current = groups.at(-1);
    if (current && current.key === key) {
      current.entries.push(entry);
    } else {
      groups.push({
        key,
        label: dayLabel(entry.timestamp, now),
        entries: [entry],
      });
    }
  }
  return groups;
}

export default function ChangelogPage() {
  const groups = groupByDay(changelogEntries, Date.now());

  return (
    <>
      <PageHeader
        title="Changelog"
        description="What changed and when. No surprises."
      />
      {groups.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScrollText />
            </EmptyMedia>
            <EmptyTitle>Nothing yet</EmptyTitle>
            <EmptyDescription>
              No changes logged. Enjoy the calm before the commits.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        // Day groups breathe apart; entries within a day stack tight, so a
        // burst of pushes reads as one busy day instead of scattered cards.
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </h2>
                <div aria-hidden="true" className="h-px flex-1 bg-border" />
              </div>
              <div className="flex flex-col gap-2">
                {group.entries.map((entry) => (
                  <Card key={`${entry.timestamp}-${entry.title}`} size="sm">
                    <CardHeader>
                      <CardTitle className="truncate text-[15px] tracking-tight">
                        {entry.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ChangelogMarkdown value={entry.description} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
