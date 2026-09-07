import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="flex flex-col gap-5" aria-label="Loading screen time">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-96 w-full" />
    </section>
  );
}
