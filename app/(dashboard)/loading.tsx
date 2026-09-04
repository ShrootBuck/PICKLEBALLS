import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-2 w-full" />
          <Card size="sm">
            <CardHeader>
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </CardHeader>
          </Card>
        </div>
        <Card size="sm">
          <CardHeader>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-40" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
