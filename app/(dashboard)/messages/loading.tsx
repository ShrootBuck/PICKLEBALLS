import { Skeleton } from "@/components/ui/skeleton";
export default function LoadingMessages() {
  return (
    <section
      className="flex h-full flex-col gap-5 p-6"
      aria-busy="true"
      aria-label="Loading messages"
    >
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </section>
  );
}
