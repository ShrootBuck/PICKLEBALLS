import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading streak"
      className="flex flex-col gap-6"
    >
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-72" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-40" />
    </section>
  );
}
