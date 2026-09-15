import { BackButton } from "@/components/social/back-button";
import { Skeleton } from "@/components/ui/skeleton";

export default function PostLoading() {
  return (
    <section
      aria-label="Loading conversation"
      aria-busy="true"
      className="flex flex-col gap-5"
    >
      <BackButton />
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-4 w-3/4" />
      <p className="text-sm text-muted-foreground">Loading conversation…</p>
      <Skeleton className="h-20 w-full" />
    </section>
  );
}
