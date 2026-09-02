import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
