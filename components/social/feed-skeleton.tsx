import { Skeleton } from "@/components/ui/skeleton";

export function FeedSkeleton() {
  return (
    <section
      className="flex flex-col gap-6"
      aria-label="Loading posts"
      aria-busy="true"
    >
      <div className="flex gap-5 border-b pb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center gap-3">
            <Skeleton className="size-14 rounded-full" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
      {[1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-4 border-b pb-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
          <Skeleton className="aspect-[4/3] w-full rounded-sm" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </section>
  );
}
