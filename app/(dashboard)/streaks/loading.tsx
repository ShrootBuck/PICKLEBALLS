import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading streaks"
      className="flex flex-col gap-6"
    >
      <Skeleton className="h-12 w-3/4" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </section>
  );
}
