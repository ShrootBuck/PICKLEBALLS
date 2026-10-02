"use client";

import {
  ArrowRight,
  CalendarRange,
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  Clock3,
  Gauge,
  History,
  Home,
  Mountain,
  Plus,
  ScrollText,
  Settings,
  Shield,
  Smartphone,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useSocial } from "@/components/social/social-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";
import { formatDayShort } from "@/lib/time";
import { cn } from "@/lib/utils";

const destinations = [
  { href: "/", label: "Home", icon: Home },
  { href: "/squad", label: "Squad", icon: Users },
  { href: "/bucket-list", label: "Bucket list", icon: Mountain },
  { href: "/goals", label: "Goals", icon: Target, railOnly: true },
  { href: "/wrapped", label: "Wrapped", icon: Sparkles, railOnly: true },
  // Weekly and reached from the Home reminder, so mobile keeps it in the circle menu.
  {
    href: "/screen-time",
    label: "Screen Time",
    icon: Smartphone,
    railOnly: true,
  },
  { href: "/timeblock", label: "Timeblock", icon: CalendarRange },
  { href: "/profile", label: "Profile", icon: null },
];

export function SocialShell({
  circles,
  pendingVerdicts,
  bucketVotes,
  superAdmin,
  bell,
  children,
}: {
  circles: { id: string; name: string; role: "OWNER" | "MEMBER" }[];
  pendingVerdicts: number;
  bucketVotes: number;
  superAdmin: boolean;
  bell: ReactNode;
  children: ReactNode;
}) {
  const { viewer, circleId, day, tasks, openComposer, scrolls } = useSocial();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const routeKey = `${pathname}?${query}`;
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigating = useRef(false);
  const [switching, setSwitching] = useState(false);
  const currentCircle = circles.find((item) => item.id === circleId);
  const verified = tasks.filter((task) => task.status === "VERIFIED").length;
  const wide =
    ["/screen-time", "/timeblock", "/history", "/admin", "/changelog"].includes(
      pathname,
    ) ||
    pathname.startsWith("/superadmin") ||
    pathname.startsWith("/goals") ||
    pathname === "/wrapped";
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const target = scrolls.get(routeKey) ?? 0;
    navigating.current = true;
    const observer = new ResizeObserver(restore);
    const mutations = new MutationObserver(restore);
    function restore() {
      if (!node) return;
      // A route's loading skeleton must not clamp and overwrite the feed position.
      const hash = window.location.hash.slice(1);
      if ((target > 0 || hash) && node.querySelector('[aria-busy="true"]'))
        return;
      const anchor = hash ? document.getElementById(hash) : null;
      if (anchor && node.contains(anchor))
        anchor.scrollIntoView({ block: "start" });
      else node.scrollTop = target;
      navigating.current = false;
      observer.disconnect();
      mutations.disconnect();
    }
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    mutations.observe(node, { childList: true, subtree: true });
    restore();
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [routeKey, scrolls]);
  useEffect(() => {
    const capture = () => {
      if (!navigating.current && scrollRef.current)
        scrolls.set(routeKey, scrollRef.current.scrollTop);
      navigating.current = true;
    };
    window.addEventListener("popstate", capture);
    return () => window.removeEventListener("popstate", capture);
  }, [routeKey, scrolls]);

  async function switchCircle(id: string) {
    if (id === circleId || switching) return;
    setSwitching(true);
    try {
      const response = await appFetch("/api/circles/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ circleId: id }),
      });
      if (!response.ok) throw new Error("Could not switch circles.");
      router.push("/");
    } catch {
      toast.add({
        title: "Could not switch circles. Try again.",
        type: "error",
      });
    } finally {
      setSwitching(false);
    }
  }

  function navLinks(bottom: boolean) {
    const proofs =
      pendingVerdicts > 0 &&
      `${pendingVerdicts} ${pendingVerdicts === 1 ? "proof" : "proofs"} to review`;
    const votes =
      bucketVotes > 0 &&
      `${bucketVotes} bucket list ${bucketVotes === 1 ? "vote" : "votes"} waiting on you`;
    const counts: Record<string, { count: number; label: string }> = {
      "/squad": { count: pendingVerdicts, label: proofs || "" },
      "/bucket-list": { count: bucketVotes, label: votes || "" },
    };
    return destinations.flatMap(({ href, label, icon: Icon, railOnly }) => {
      if (bottom && railOnly) return [];
      const active =
        href === "/"
          ? pathname === "/"
          : pathname.startsWith(href) ||
            (href === "/profile" && pathname.startsWith("/members/"));
      const badge = counts[href];
      return (
        <Link
          href={href}
          key={href}
          className={cn("social-nav-link", active && "is-active")}
          aria-current={active ? "page" : undefined}
          onClick={(event) => {
            if (
              pathname !== href ||
              query ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            navigating.current = false;
            scrollRef.current?.scrollTo({
              top: 0,
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "instant"
                : "smooth",
            });
          }}
        >
          <span className="social-nav-icon">
            {Icon ? (
              <Icon className="size-6" strokeWidth={active ? 2.3 : 1.7} />
            ) : (
              <Avatar className="size-6">
                <AvatarImage src={viewer.image ?? undefined} alt="" />
                <AvatarFallback>{viewer.initials}</AvatarFallback>
              </Avatar>
            )}
            {badge && badge.count > 0 && (
              <Badge className="nav-count" aria-label={badge.label}>
                {badge.count > 99 ? "99+" : badge.count}
              </Badge>
            )}
          </span>
          <span>{label}</span>
        </Link>
      );
    });
  }

  return (
    <div
      className="social-shell"
      onClickCapture={(event) => {
        const link = (event.target as Element).closest("a[href]");
        if (
          !link ||
          link.hasAttribute("download") ||
          (link.getAttribute("target") !== null &&
            link.getAttribute("target") !== "_self") ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        const destination = new URL(
          link.getAttribute("href") ?? "",
          window.location.href,
        );
        if (
          destination.origin === window.location.origin &&
          `${destination.pathname}?${destination.searchParams}` !== routeKey
        ) {
          if (scrollRef.current)
            scrolls.set(routeKey, scrollRef.current.scrollTop);
          navigating.current = true;
        }
      }}
    >
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="social-rail">
        <Link href="/" className="social-wordmark">
          <span className="brand-symbol" aria-hidden="true">
            p.
          </span>
          <span>pickle balls</span>
        </Link>
        <nav aria-label="Main navigation" className="flex flex-col gap-1">
          {navLinks(false)}
        </nav>
        <Button className="mt-5 w-full" onClick={() => openComposer()}>
          <Plus data-icon="inline-start" /> Create
        </Button>
        <div className="mt-auto flex flex-col pt-8">
          {[
            ...(superAdmin
              ? [
                  {
                    href: "/superadmin",
                    label: "Admin console",
                    icon: Gauge,
                  },
                ]
              : []),
            { href: "/changelog", label: "What's new", icon: ScrollText },
            { href: "/settings", label: "Settings", icon: Settings },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "social-nav-link",
                (pathname === href || pathname.startsWith(`${href}/`)) &&
                  "is-active",
              )}
              aria-current={
                pathname === href || pathname.startsWith(`${href}/`)
                  ? "page"
                  : undefined
              }
            >
              <span className="social-nav-icon">
                <Icon className="size-6" strokeWidth={1.7} />
              </span>
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </aside>
      <div className="social-workspace">
        <header className="social-header">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  className="circle-trigger"
                  aria-label={`Circle menu: ${currentCircle?.name ?? "Pickle Balls"}`}
                />
              }
            >
              <span className="min-w-0 truncate">
                {currentCircle?.name ?? "Pickle Balls"}
              </span>
              <ChevronDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="truncate">
                  {currentCircle?.name ?? "Current circle"}
                </DropdownMenuLabel>
                <DropdownMenuItem render={<Link href="/history" />}>
                  <History /> Circle history
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="md:hidden"
                  render={<Link href="/goals" />}
                >
                  <Target /> Goals
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="md:hidden"
                  render={<Link href="/wrapped" />}
                >
                  <Sparkles /> Wrapped
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="md:hidden"
                  render={<Link href="/screen-time" />}
                >
                  <Smartphone /> Screen Time
                </DropdownMenuItem>
                {currentCircle?.role === "OWNER" && (
                  <DropdownMenuItem render={<Link href="/admin" />}>
                    <Shield /> Owner tools &amp; invites
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Your circles</DropdownMenuLabel>
                {circles.map((circle) => (
                  <DropdownMenuItem
                    key={circle.id}
                    disabled={switching || circle.id === circleId}
                    onClick={() => switchCircle(circle.id)}
                  >
                    {circle.id === circleId ? <Check /> : <Users />}
                    <span className="max-w-56 truncate">{circle.name}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem render={<Link href="/circles" />}>
                  <Users /> Manage circles
                </DropdownMenuItem>
              </DropdownMenuGroup>
              {superAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem render={<Link href="/superadmin" />}>
                      <Gauge /> Admin console
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              className="md:hidden"
              aria-label="Create a task, proof, or check-in"
              onClick={() => openComposer()}
            >
              <Plus data-icon="inline-start" />
              <span className="hidden min-[380px]:inline">Create</span>
            </Button>
            <Link
              href="/settings"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "md:hidden",
              )}
              aria-label="Settings"
              aria-current={pathname === "/settings" ? "page" : undefined}
            >
              <Settings />
            </Link>
            {bell}
          </div>
        </header>
        <div
          ref={scrollRef}
          data-slot="social-scroll"
          className="social-scroll"
          onScroll={(event) => {
            if (!navigating.current)
              scrolls.set(routeKey, event.currentTarget.scrollTop);
          }}
        >
          <div className={cn("social-columns", wide && "social-columns-wide")}>
            <main
              id="main"
              tabIndex={-1}
              className={cn("social-content", wide && "social-content-wide")}
            >
              {children}
            </main>
            {!wide && (
              <aside className="social-day-panel" aria-label="Your tasks">
                <Link href="/profile" className="flex items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarImage src={viewer.image ?? undefined} alt="" />
                    <AvatarFallback>{viewer.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {viewer.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDayShort(day)}
                    </p>
                  </div>
                </Link>
                <div className="mt-6 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold">Today</h2>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {verified}/{tasks.length} verified
                  </span>
                </div>
                <Progress
                  value={tasks.length ? (verified / tasks.length) * 100 : 0}
                  aria-label={`${verified} of ${tasks.length} tasks verified`}
                  className="mt-3"
                />
                <div className="mt-4 flex flex-col gap-2.5">
                  {tasks.slice(0, 4).map((task) => {
                    const StatusIcon =
                      task.status === "VERIFIED"
                        ? Check
                        : task.status === "MISSED"
                          ? CircleAlert
                          : task.proof
                            ? Clock3
                            : Circle;
                    return (
                      <Link
                        href={`/profile?${new URLSearchParams({ circle: circleId, tab: "tasks", day })}#task-${encodeURIComponent(task.id)}`}
                        key={task.id}
                        className="flex items-start gap-2 text-sm"
                      >
                        <StatusIcon
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            task.status === "VERIFIED"
                              ? "text-success"
                              : "text-muted-foreground/40",
                          )}
                        />
                        <span className="line-clamp-2">{task.title}</span>
                      </Link>
                    );
                  })}
                  {!tasks.length && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      No tasks yet. One small commitment is a good place to
                      start.
                    </p>
                  )}
                </div>
                <Link
                  href="/profile?tab=tasks"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "mt-5 w-full justify-between",
                  )}
                >
                  {tasks.length ? "All tasks" : "Add a task"}
                  <ArrowRight data-icon="inline-end" />
                </Link>
                {pendingVerdicts > 0 && (
                  <Link href="/squad" className="review-nudge">
                    <Users className="size-5" />
                    <span>
                      <strong className="block font-medium">
                        Your friends showed up.
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        {pendingVerdicts} proof
                        {pendingVerdicts === 1 ? " needs" : "s need"} a verdict.
                      </span>
                    </span>
                    <ArrowRight className="ml-auto size-4" />
                  </Link>
                )}
              </aside>
            )}
          </div>
        </div>
        <nav className="social-bottom-nav" aria-label="Mobile navigation">
          {navLinks(true)}
        </nav>
      </div>
    </div>
  );
}
