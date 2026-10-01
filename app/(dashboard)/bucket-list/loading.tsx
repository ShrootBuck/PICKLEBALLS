import { Skeleton } from "@/components/ui/skeleton";

export default function BucketListLoading() {
  return (
    <section
      className="flex flex-col gap-5"
      aria-label="Loading bucket list"
      aria-busy="true"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full max-w-md" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-44 w-full rounded-lg" />
      <Skeleton className="h-44 w-full rounded-lg" />
    </section>
  );
}
