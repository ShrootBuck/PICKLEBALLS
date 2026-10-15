import { Skeleton } from "@/components/ui/skeleton";
export default function LoadingMessages() {
  return (
    <section
      className="dm-workspace"
      aria-busy="true"
      aria-label="Loading messages"
    >
      <div className="dm-inbox">
        <div className="dm-inbox-header">
          <Skeleton className="h-7 w-36" />
        </div>
        <div className="dm-search">
          <Skeleton className="h-[38px] w-full rounded-[10px]" />
        </div>
        <div className="dm-conversations">
          {[44, 36, 52, 40].map((width) => (
            <div key={width} className="dm-conversation">
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <div className="dm-conversation-body" style={{ gap: 8 }}>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3.5" style={{ width: `${width}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="dm-idle" />
    </section>
  );
}
