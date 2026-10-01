import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted after:absolute after:inset-0 after:-translate-x-full after:animate-[skeleton-shimmer_1.6s_ease-in-out_infinite] after:bg-linear-to-r after:from-transparent after:via-foreground/6 after:to-transparent",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
