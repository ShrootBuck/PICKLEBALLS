import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton() {
  return (
    <section
      className="flex flex-col gap-6"
      aria-label="Loading"
      aria-busy="true"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-8 w-64 max-w-full" />
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-72 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
    </section>
  );
}
