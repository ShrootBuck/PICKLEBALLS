import { Skeleton } from "@/components/ui/skeleton";

export function ProfileSkeleton() {
  return (
    <section
      className="flex flex-col gap-6"
      aria-label="Loading profile"
      aria-busy="true"
    >
      <div className="flex items-center gap-4">
        <Skeleton className="size-20 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Skeleton className="h-7 w-40 max-w-full" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-4 w-24" />
      <div className="profile-stats">
        {[1, 2, 3].map((id) => (
          <div key={id} className="flex flex-col gap-3">
            <Skeleton className="h-8 w-10" />
            <Skeleton className="h-3 w-20 max-w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-3/4" />
      <div className="flex gap-4 border-b pb-4">
        <Skeleton className="h-6 flex-1" />
        <Skeleton className="h-6 flex-1" />
      </div>
      <div className="grid grid-cols-3 gap-1">
        {[1, 2, 3, 4, 5, 6].map((id) => (
          <Skeleton key={id} className="aspect-square" />
        ))}
      </div>
    </section>
  );
}
