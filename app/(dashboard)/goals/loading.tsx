import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading goals"
      className="flex flex-col gap-6"
    >
      <Skeleton className="h-12 w-3/4" />
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </section>
  );
}
