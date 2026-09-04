import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-56 max-w-full" />
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
