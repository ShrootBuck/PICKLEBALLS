import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-8 w-56 max-w-full rounded-lg" />
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-11 w-40 rounded-lg" />
        </CardContent>
      </Card>
    </div>
  );
}
