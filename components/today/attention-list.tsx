import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

export type AttentionItem = {
  key: string;
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="today-attention" className="today-card">
      <h2 id="today-attention" className="sr-only">
        Needs you
      </h2>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.key}>
            <Link href={item.href} className="attention-row">
              <span className="attention-icon">
                <item.icon className="size-[18px]" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold">{item.title}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {item.description}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
