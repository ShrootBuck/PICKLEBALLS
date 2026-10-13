"use client";

import {
  CalendarRange,
  CheckCheck,
  Flame,
  Gauge,
  History,
  type LucideIcon,
  Mountain,
  Newspaper,
  Plus,
  ScrollText,
  Settings,
  Shield,
  Smartphone,
  SunMedium,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import {
  CircleSwitcher,
  type ShellCircle,
} from "@/components/layout/circle-switcher";
import { useSocial } from "@/components/social/social-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type NavItem,
  type NavItemId,
  type NavSectionId,
  navSections,
} from "@/lib/app-nav";
import { cn } from "@/lib/utils";

export const navIcons: Record<NavItemId, LucideIcon> = {
  today: SunMedium,
  timeblock: CalendarRange,
  goals: Target,
  streaks: Flame,
  feed: Newspaper,
  review: CheckCheck,
  members: Users,
  "bucket-list": Mountain,
  "screen-time": Smartphone,
  history: History,
  profile: UserRound,
  settings: Settings,
  owner: Shield,
  changelog: ScrollText,
  superadmin: Gauge,
};

export type NavCounts = { verdicts: number; votes: number };

function countLabel(item: NavItem, count: number) {
  return item.badge === "verdicts"
    ? `${count} ${count === 1 ? "proof" : "proofs"} to review`
    : `${count} bucket list ${count === 1 ? "vote" : "votes"} waiting on you`;
}

function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <Badge className="nav-count" aria-label={label}>
      {count > 99 ? "99+" : count}
    </Badge>
  );
}

function isCurrentUrl(href: string) {
  const target = new URL(href, window.location.href);
  return (
    target.pathname === window.location.pathname &&
    target.search === window.location.search
  );
}

// Tapping the destination you are already on returns to the top, like native tabs.
export function NavLink({
  href,
  active,
  className,
  onReselect,
  children,
  ...props
}: {
  href: string;
  active: boolean;
  className: string;
  onReselect: () => void;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(className, active && "is-active")}
      aria-current={active ? "page" : undefined}
      onClick={(event: MouseEvent) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          !isCurrentUrl(href)
        )
          return;
        event.preventDefault();
        onReselect();
      }}
      {...props}
    >
      {children}
    </Link>
  );
}

export function AppSidebar({
  items,
  active,
  counts,
  circles,
  superAdmin,
  onReselect,
}: {
  items: NavItem[];
  active: NavItemId | null;
  counts: NavCounts;
  circles: ShellCircle[];
  superAdmin: boolean;
  onReselect: () => void;
}) {
  const { viewer, circleId, openComposer } = useSocial();
  const link = (item: NavItem) => {
    const Icon = navIcons[item.id];
    const count = item.badge ? counts[item.badge] : 0;
    return (
      <NavLink
        key={item.id}
        href={item.href}
        active={active === item.id}
        className="app-nav-link"
        onReselect={onReselect}
      >
        <Icon className="size-[18px] shrink-0" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {count > 0 && item.badge && (
          <Badge
            className="ml-auto h-5 min-w-5 px-1.5 tabular-nums"
            aria-label={countLabel(item, count)}
          >
            {count > 99 ? "99+" : count}
          </Badge>
        )}
      </NavLink>
    );
  };
  const group = (title: string, ids: NavItemId[]) => {
    const entries = items.filter((item) => ids.includes(item.id));
    if (!entries.length) return null;
    return (
      <div className="flex flex-col gap-0.5">
        <p className="app-nav-heading">{title}</p>
        {entries.map(link)}
      </div>
    );
  };
  return (
    <aside className="app-sidebar" aria-label="Sidebar">
      <Link href="/" className="social-wordmark px-2">
        <span className="brand-symbol" aria-hidden="true">
          p.
        </span>
        <span>pickle balls</span>
      </Link>
      <CircleSwitcher
        circles={circles}
        circleId={circleId}
        superAdmin={superAdmin}
        variant="sidebar"
      />
      <Button className="w-full" onClick={() => openComposer()}>
        <Plus data-icon="inline-start" /> Create
      </Button>
      <nav
        aria-label="Main navigation"
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1"
      >
        <div className="flex flex-col gap-0.5">
          {items
            .filter((item) => item.id === "today" || item.id === "feed")
            .map(link)}
        </div>
        {group("Your day", ["timeblock", "goals", "streaks"])}
        {group("Squad", [
          "review",
          "members",
          "bucket-list",
          "screen-time",
          "history",
        ])}
        <div className="mt-auto flex flex-col gap-0.5">
          {items
            .filter((item) =>
              ["changelog", "settings", "owner", "superadmin"].includes(
                item.id,
              ),
            )
            .map(link)}
        </div>
      </nav>
      <NavLink
        href="/profile"
        active={active === "profile"}
        className="app-sidebar-profile"
        onReselect={onReselect}
      >
        <Avatar className="size-8">
          <AvatarImage src={viewer.image ?? undefined} alt="" />
          <AvatarFallback>{viewer.initials}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{viewer.name}</span>
          <span className="text-xs text-muted-foreground">Your profile</span>
        </span>
      </NavLink>
    </aside>
  );
}

const tabIcons: Record<Exclude<NavSectionId, "you">, LucideIcon> = {
  today: SunMedium,
  feed: Newspaper,
  squad: Users,
};

export function MobileTabBar({
  section,
  counts,
  onReselect,
}: {
  section: NavSectionId | null;
  counts: NavCounts;
  onReselect: () => void;
}) {
  const { viewer, openComposer } = useSocial();
  const tab = (id: NavSectionId) => {
    const entry = navSections.find((item) => item.id === id);
    if (!entry) return null;
    const Icon = id === "you" ? null : tabIcons[id];
    const activeTab = section === id;
    const squadCount = counts.verdicts + counts.votes;
    return (
      <NavLink
        key={id}
        href={entry.href}
        active={activeTab}
        className="app-tab"
        onReselect={onReselect}
      >
        <span className="relative grid size-6 place-items-center">
          {Icon ? (
            <Icon className="size-6" strokeWidth={activeTab ? 2.3 : 1.7} />
          ) : (
            <Avatar className="app-tab-avatar size-6">
              <AvatarImage src={viewer.image ?? undefined} alt="" />
              <AvatarFallback>{viewer.initials}</AvatarFallback>
            </Avatar>
          )}
          {id === "squad" && (
            <CountBadge
              count={squadCount}
              label={`${squadCount} ${squadCount === 1 ? "thing needs" : "things need"} you in Squad`}
            />
          )}
        </span>
        <span>{entry.label}</span>
      </NavLink>
    );
  };
  return (
    <nav className="app-tabbar" aria-label="Mobile navigation">
      {tab("today")}
      {tab("feed")}
      <div className="grid place-items-center">
        <Button
          className="app-create"
          aria-label="Create a task, proof, check-in, or streak"
          onClick={() => openComposer()}
        >
          <Plus className="size-6" strokeWidth={2.4} />
        </Button>
      </div>
      {tab("squad")}
      {tab("you")}
    </nav>
  );
}

export function SectionTabs({
  items,
  active,
  counts,
  onReselect,
}: {
  items: NavItem[];
  active: NavItemId | null;
  counts: NavCounts;
  onReselect: () => void;
}) {
  if (items.length < 2) return null;
  return (
    <nav className="section-tabs" aria-label="Section pages">
      {items.map((item) => {
        const count = item.badge ? counts[item.badge] : 0;
        return (
          <NavLink
            key={item.id}
            href={item.href}
            active={active === item.id}
            className="section-tab"
            onReselect={onReselect}
          >
            {item.label}
            {count > 0 && item.badge && (
              <>
                <span className="section-tab-count" aria-hidden="true">
                  {count > 99 ? "99+" : count}
                </span>
                <span className="sr-only">, {countLabel(item, count)}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
