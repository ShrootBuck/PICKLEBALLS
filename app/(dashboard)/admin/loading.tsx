import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-xl" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-11 w-40 rounded-lg" />
          </CardContent>
        </Card>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
