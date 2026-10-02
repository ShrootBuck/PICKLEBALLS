import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section
      className="flex flex-col gap-5"
      aria-busy="true"
      aria-label="Loading admin console"
    >
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </section>
  );
}
