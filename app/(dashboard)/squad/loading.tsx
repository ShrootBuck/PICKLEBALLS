import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-36 w-full rounded-xl" />
      <div className="grid items-start gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} size="sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
