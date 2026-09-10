import { Skeleton } from "@/components/ui/skeleton";

export default function SquadLoading() {
  return (
    <section
      className="flex flex-col gap-6"
      aria-label="Loading squad"
      aria-busy="true"
    >
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="h-4 w-56 max-w-full" />
      <div className="flex gap-4 border-b pb-4">
        <Skeleton className="h-6 flex-1" />
        <Skeleton className="h-6 flex-1" />
      </div>
      <Skeleton className="h-5 w-48" />
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="aspect-[4/5] w-full" />
    </section>
  );
}
