"use client";

import {
  CalendarRange,
  CheckCheck,
  ChevronDown,
  ChevronsUpDown,
  Flame,
  Gauge,
  History,
  LayoutGrid,
  type LucideIcon,
  MessageCircle,
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
import { type MouseEvent, type ReactNode, useState } from "react";
import {
  CircleSwitcher,
  type ShellCircle,
} from "@/components/layout/circle-switcher";
import { useSocial } from "@/components/social/social-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  messages: MessageCircle,
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

export type NavCounts = { verdicts: number; votes: number; messages: number };
type NavigationProps = {
  items: NavItem[];
  active: NavItemId | null;
  counts: NavCounts;
  onReselect: () => void;
};

const groups: { label: string; sections: NavSectionId[] }[] = [
  { label: "Your day", sections: ["today"] },
  { label: "Your circle", sections: ["feed", "squad"] },
];

function countLabel(item: NavItem, count: number) {
  if (item.badge === "messages") return `${count} unread messages`;
  return item.badge === "verdicts"
    ? `${count} ${count === 1 ? "proof" : "proofs"} to review`
    : `${count} bucket list ${count === 1 ? "vote" : "votes"} waiting on you`;
}

function ItemBadge({ item, counts }: { item: NavItem; counts: NavCounts }) {
  const count = item.badge ? counts[item.badge] : 0;
  return count > 0 ? (
    <Badge className="app-nav-count" aria-label={countLabel(item, count)}>
      {count > 99 ? "99+" : count}
    </Badge>
  ) : null;
}

function isCurrentUrl(href: string) {
  const target = new URL(href, window.location.href);
  return (
    target.pathname === window.location.pathname &&
    target.search === window.location.search
  );
}

// Reselecting a destination returns to the top without losing feed state.
export function NavLink({
  href,
  active,
  className,
  onReselect,
  onNavigate,
  children,
  ...props
}: {
  href: string;
  active: boolean;
  className: string;
  onReselect: () => void;
  onNavigate?: () => void;
  children: ReactNode;
  "aria-label"?: string;
  title?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(className, active && "is-active")}
      aria-current={active ? "page" : undefined}
      onClick={(event: MouseEvent) => {
        onNavigate?.();
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

function NavigationGroups({
  items,
  active,
  counts,
  onReselect,
  account = false,
  onNavigate,
}: NavigationProps & { account?: boolean; onNavigate?: () => void }) {
  return [
    ...groups,
    ...(account
      ? [{ label: "You & settings", sections: ["you" as const] }]
      : []),
  ].map(({ label, sections }) => (
    <div className="app-nav-group" key={label}>
      <p className="app-nav-heading">{label}</p>
      <div className="app-nav-items">
        {items
          .filter((item) => sections.includes(item.section))
          .map((item) => {
            const Icon = navIcons[item.id];
            return (
              <NavLink
                key={item.id}
                href={item.href}
                active={active === item.id}
                className="app-nav-link"
                onReselect={onReselect}
                onNavigate={onNavigate}
                title={item.label}
              >
                <Icon className="app-nav-icon" aria-hidden="true" />
                <span className="app-nav-label">{item.label}</span>
                <ItemBadge item={item} counts={counts} />
              </NavLink>
            );
          })}
      </div>
    </div>
  ));
}

function AccountMenu({
  items,
  active,
}: Pick<NavigationProps, "items" | "active">) {
  const { viewer } = useSocial();
  const personal = items.filter(
    (item) => item.section === "you" && !item.access,
  );
  const management = items.filter((item) => item.access);
  const entry = (item: NavItem) => {
    const Icon = navIcons[item.id];
    return (
      <DropdownMenuItem
        key={item.id}
        render={
          <Link
            href={item.href}
            aria-current={active === item.id ? "page" : undefined}
          />
        }
      >
        <Icon /> {item.label}
      </DropdownMenuItem>
    );
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "app-account",
              items.some(
                (item) => item.id === active && item.section === "you",
              ) && "is-active",
            )}
            aria-label="Your account menu"
          />
        }
      >
        <Avatar className="size-9 shrink-0">
          <AvatarImage
            userId={viewer.id}
            src={viewer.image ?? undefined}
            alt=""
          />
          <AvatarFallback>{viewer.initials}</AvatarFallback>
        </Avatar>
        <span className="app-account-label">
          <span className="truncate font-semibold">{viewer.name}</span>
          <span className="text-xs font-normal text-muted-foreground">
            Profile & settings
          </span>
        </span>
        <ChevronsUpDown
          data-icon="inline-end"
          className="app-account-chevron"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={10}
        className="w-60"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{viewer.name}</DropdownMenuLabel>
          {personal.map(entry)}
        </DropdownMenuGroup>
        {management.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Manage</DropdownMenuLabel>
              {management.map(entry)}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar({
  circles,
  superAdmin,
  ...navigation
}: NavigationProps & {
  circles: ShellCircle[];
  superAdmin: boolean;
}) {
  const { circleId, openComposer } = useSocial();
  return (
    <aside className="app-sidebar" aria-label="Sidebar">
      <Link
        href="/"
        className="social-wordmark app-brand"
        aria-label="Pickle Balls, Today"
      >
        <span className="brand-symbol" aria-hidden="true">
          p.
        </span>
        <span className="app-brand-name">pickle balls</span>
      </Link>
      <div className="app-sidebar-circle">
        <CircleSwitcher
          circles={circles}
          circleId={circleId}
          superAdmin={superAdmin}
          variant="sidebar"
        />
      </div>
      <Button
        className="app-sidebar-create"
        onClick={() => openComposer()}
        aria-label="Create a task, proof, check-in, or streak"
      >
        <Plus data-icon="inline-start" /> <span>Create</span>
      </Button>
      <nav aria-label="Main navigation" className="app-sidebar-nav">
        <NavigationGroups {...navigation} />
      </nav>
      <div className="app-sidebar-footer">
        <AccountMenu items={navigation.items} active={navigation.active} />
      </div>
    </aside>
  );
}

export function MobileMenu(props: NavigationProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="app-menu-trigger"
            aria-label="Browse all pages"
          />
        }
      >
        <LayoutGrid />
      </SheetTrigger>
      <SheetContent side="left" className="app-navigation-sheet">
        <SheetHeader>
          <SheetTitle>Explore Pickle Balls</SheetTitle>
          <SheetDescription>
            Your day, your circle, and your account.
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="All pages" className="app-menu-nav">
          <NavigationGroups
            {...props}
            account
            onNavigate={() => setOpen(false)}
          />
        </nav>
      </SheetContent>
    </Sheet>
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
        <span className="app-tab-symbol">
          {Icon ? (
            <Icon className="size-[22px]" strokeWidth={activeTab ? 2.2 : 1.8} />
          ) : (
            <Avatar className="app-tab-avatar size-6">
              <AvatarImage
                userId={viewer.id}
                src={viewer.image ?? undefined}
                alt=""
              />
              <AvatarFallback>{viewer.initials}</AvatarFallback>
            </Avatar>
          )}
          {id === "squad" && squadCount > 0 && (
            <Badge
              className="nav-count"
              aria-label={`${squadCount} ${squadCount === 1 ? "thing needs" : "things need"} you in Squad`}
            >
              {squadCount > 99 ? "99+" : squadCount}
            </Badge>
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
          <Plus strokeWidth={2.2} />
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
}: NavigationProps) {
  // Account destinations live in the account menu and the all-pages drawer.
  if (items.length < 2 || items[0]?.section === "you") return null;
  const overflow = items.length > 4 ? items.slice(2) : [];
  const primary = overflow.length ? items.slice(0, 2) : items;
  const selected = overflow.find((item) => item.id === active);
  const overflowCount = overflow.reduce(
    (total, item) => total + (item.badge ? counts[item.badge] : 0),
    0,
  );
  return (
    <nav className="section-tabs" aria-label="Section pages">
      {primary.map((item) => (
        <NavLink
          key={item.id}
          href={item.href}
          active={active === item.id}
          className="section-tab"
          onReselect={onReselect}
        >
          {item.label}
          <ItemBadge item={item} counts={counts} />
        </NavLink>
      ))}
      {overflow.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="plain"
                className={cn(
                  "section-tab section-tab-more",
                  selected && "is-active",
                )}
                aria-label="More circle pages"
              />
            }
          >
            {selected?.label ?? "More"}
            {!selected && overflowCount > 0 && (
              <Badge className="app-nav-count">
                {overflowCount > 99 ? "99+" : overflowCount}
              </Badge>
            )}
            <ChevronDown data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Your circle</DropdownMenuLabel>
              {overflow.map((item) => {
                const Icon = navIcons[item.id];
                return (
                  <DropdownMenuItem
                    key={item.id}
                    render={
                      <Link
                        href={item.href}
                        aria-current={active === item.id ? "page" : undefined}
                      />
                    }
                  >
                    <Icon /> {item.label}
                    <ItemBadge item={item} counts={counts} />
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}
