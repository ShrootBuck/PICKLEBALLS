import { Skeleton } from "@/components/ui/skeleton";

export default function BucketItemLoading() {
  return (
    <section
      className="flex flex-col gap-5"
      aria-label="Loading bucket list idea"
      aria-busy="true"
    >
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-52 w-full rounded-lg" />
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </section>
  );
}
