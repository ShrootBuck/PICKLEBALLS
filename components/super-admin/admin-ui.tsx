import { formatDistanceToNowStrict } from "date-fns";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { activityIcon } from "@/components/layout/activity-icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ADMIN_PAGE_SIZE } from "@/lib/super-admin-data";
import { formatMemberJoined } from "@/lib/time";
import { cn } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("en-US");
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

export function plural(count: number, singular: string, many = `${singular}s`) {
  return `${numberFormatter.format(count)} ${count === 1 ? singular : many}`;
}

export function formatCompact(value: number) {
  return compactFormatter.format(value);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function humanize(value: string) {
  const text = value.toLowerCase().replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function userHref(id: string) {
  return `/superadmin/users/${encodeURIComponent(id)}`;
}

export function circleHref(id: string) {
  return `/superadmin/circles/${encodeURIComponent(id)}`;
}

export function RelativeTime({
  date,
  fallback = "Never",
}: {
  date: Date | null | undefined;
  fallback?: string;
}) {
  if (!date) return <span className="text-muted-foreground">{fallback}</span>;
  return (
    <time dateTime={date.toISOString()} title={formatMemberJoined(date)}>
      {formatDistanceToNowStrict(date, { addSuffix: true })}
    </time>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "warning";
}) {
  return (
    <Card size="sm" className={cn(tone === "warning" && "border-destructive")}>
      <CardContent className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-[-0.03em] tabular-nums">
          {value}
        </p>
        {hint ? (
          <p className="text-xs text-muted-foreground tabular-nums">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {children}
    </div>
  );
}

export function Person({
  user,
  detail,
  size = "default",
}: {
  user: {
    id: string;
    name: string;
    image: string | null;
    initials: string;
  };
  detail?: ReactNode;
  size?: "default" | "sm";
}) {
  return (
    <Link
      href={userHref(user.id)}
      className="flex min-w-0 items-center gap-2.5 hover:underline"
    >
      <Avatar size={size}>
        <AvatarImage src={user.image ?? undefined} alt="" />
        <AvatarFallback>{user.initials}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{user.name}</span>
        {detail ? (
          <span className="truncate text-xs text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function DailyBars({
  data,
  label,
  className,
}: {
  data: { day: string; value: number }[];
  label: string;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((point) => point.value));
  const total = data.reduce((sum, point) => sum + point.value, 0);
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatNumber(total)} in 30 days
        </span>
      </figcaption>
      <div
        role="img"
        aria-label={`${label}: ${formatNumber(total)} over the last 30 days, peak ${formatNumber(max)} in a day`}
        className="flex h-28 items-end gap-[3px]"
      >
        {data.map((point) => (
          <div
            key={point.day}
            title={`${point.day}: ${formatNumber(point.value)}`}
            className={cn(
              "min-h-px flex-1 rounded-t-sm bg-primary/80 transition-colors hover:bg-primary",
              point.value === 0 && "bg-muted",
              className,
            )}
            style={{
              height:
                point.value === 0 ? "2px" : `${(point.value / max) * 100}%`,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[0.7rem] text-muted-foreground tabular-nums">
        <span>{data[0]?.day}</span>
        <span>{data.at(-1)?.day}</span>
      </div>
    </figure>
  );
}

export function AdminSearch({
  action,
  query,
  placeholder,
}: {
  action: string;
  query: string;
  placeholder: string;
}) {
  return (
    <Form
      action={action}
      role="search"
      className="flex w-full min-w-0 items-center gap-2 sm:w-auto"
    >
      <Input
        type="search"
        name="q"
        defaultValue={query}
        placeholder={placeholder}
        aria-label={placeholder}
        className="sm:h-8 sm:w-64"
      />
      <Button type="submit" variant="outline" size="sm">
        <Search data-icon="inline-start" />
        Search
      </Button>
    </Form>
  );
}

export function Pagination({
  basePath,
  query,
  page,
  total,
}: {
  basePath: string;
  query: string;
  page: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  if (pages <= 1) return null;
  const href = (target: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (target > 1) params.set("page", String(target));
    const search = params.toString();
    return search ? `${basePath}?${search}` : basePath;
  };
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-2 text-sm"
    >
      <span className="text-muted-foreground tabular-nums">
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href={href(page - 1)} />}
          >
            <ChevronLeft data-icon="inline-start" />
            Previous
          </Button>
        ) : null}
        {page < pages ? (
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href={href(page + 1)} />}
          >
            Next
            <ChevronRight data-icon="inline-end" />
          </Button>
        ) : null}
      </div>
    </nav>
  );
}

export function ActivityFeed({
  items,
}: {
  items: {
    id: string;
    kind: string;
    summary: string;
    createdAt: Date;
    actor?: {
      id: string;
      name: string;
      image: string | null;
      initials: string;
    };
    circle?: { id: string; name: string };
  }[];
}) {
  if (!items.length)
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((item) => {
        const Icon = activityIcon(item.kind);
        return (
          <li
            key={item.id}
            className="flex min-w-0 items-start gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <Icon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm [overflow-wrap:anywhere]">
                {item.actor ? (
                  <Link
                    href={userHref(item.actor.id)}
                    className="font-medium hover:underline"
                  >
                    {item.actor.name}
                  </Link>
                ) : null}
                {item.actor ? " " : null}
                <span className="text-muted-foreground">{item.summary}</span>
              </p>
              <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                <RelativeTime date={item.createdAt} />
                {item.circle ? (
                  <Link
                    href={circleHref(item.circle.id)}
                    className="hover:underline"
                  >
                    in {item.circle.name}
                  </Link>
                ) : null}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
