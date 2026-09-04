import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {["first", "second", "third", "fourth"].map((key) => (
            <Skeleton key={key} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
