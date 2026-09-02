import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
