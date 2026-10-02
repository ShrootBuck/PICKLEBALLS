import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading your recap"
      className="flex flex-col gap-6"
    >
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-96 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </section>
  );
}
