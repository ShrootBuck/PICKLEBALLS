import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { changelogEntries } from "@/lib/changelog";

export const metadata: Metadata = { title: "Changelog" };

export default function ChangelogPage() {
  return (
    <>
      <PageHeader
        title="Changelog"
        description="What changed and when. No surprises."
      />
      {changelogEntries.length === 0 ? (
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
        <div className="flex flex-col gap-3">
          {changelogEntries.map((entry) => (
            <Card key={`${entry.date}-${entry.title}`} size="sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="truncate text-[15px] tracking-tight">
                    {entry.title}
                  </CardTitle>
                  <Badge variant="secondary" className="ml-auto shrink-0">
                    {entry.date}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {entry.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
