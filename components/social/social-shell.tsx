"use client";

import {
  ArrowRight,
  CalendarRange,
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  Clock3,
  Home,
  Plus,
  Settings,
  Smartphone,
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  { href: "/screen-time", label: "Screen Time", icon: Smartphone },
  { href: "/timeblock", label: "Timeblock", icon: CalendarRange },
  { href: "/profile", label: "Profile", icon: null },
];

export function SocialShell({
  circles,
  pendingVerdicts,
  bell,
  children,
}: {
  circles: { id: string; name: string; role: "OWNER" | "MEMBER" }[];
  pendingVerdicts: number;
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
  const wide = [
    "/screen-time",
    "/timeblock",
    "/history",
    "/admin",
    "/changelog",
  ].includes(pathname);
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

  function navLinks() {
    return destinations.map(({ href, label, icon: Icon }) => {
      const active =
        href === "/"
          ? pathname === "/"
          : pathname.startsWith(href) ||
            (href === "/profile" && pathname.startsWith("/members/"));
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
          <span className="relative shrink-0">
            {Icon ? (
              <Icon className="size-6" strokeWidth={active ? 2.3 : 1.7} />
            ) : (
              <Avatar className="size-6">
                <AvatarImage src={viewer.image ?? undefined} alt="" />
                <AvatarFallback>{viewer.initials}</AvatarFallback>
              </Avatar>
            )}
            {href === "/squad" && pendingVerdicts > 0 && (
              <Badge
                className="nav-count"
                aria-label={`${pendingVerdicts} ${pendingVerdicts === 1 ? "proof" : "proofs"} to review`}
              >
                {pendingVerdicts > 99 ? "99+" : pendingVerdicts}
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
        <nav aria-label="Main navigation" className="flex flex-col gap-2">
          {navLinks()}
        </nav>
        <Button
          size="lg"
          className="mt-6 w-full"
          onClick={() => openComposer()}
        >
          <Plus data-icon="inline-start" /> Create
        </Button>
        <div className="mt-auto flex flex-col gap-4 pt-8">
          <p className="px-3 text-xs leading-relaxed text-muted-foreground">
            Make a promise.
            <br />
            Show the work.
            <br />
            Back your friends.
          </p>
          <Button
            nativeButton={false}
            variant="ghost"
            className="justify-start"
            render={<Link href="/settings" />}
          >
            <Settings data-icon="inline-start" /> Settings
          </Button>
        </div>
      </aside>
      <div className="social-workspace">
        <header className="social-header">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" className="circle-trigger" />}
            >
              <span className="min-w-0 truncate">
                {currentCircle?.name ?? "Pickle Balls"}
              </span>
              <ChevronDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
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
                  <Plus /> All circles / create
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              aria-label="Create a task, proof, or check-in"
              onClick={() => openComposer()}
            >
              <Plus data-icon="inline-start" />
              <span className="hidden min-[380px]:inline">Create</span>
            </Button>
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
              <aside className="social-day-panel" aria-label="Your day">
                <div className="flex items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarImage src={viewer.image ?? undefined} alt="" />
                    <AvatarFallback>{viewer.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{viewer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDayShort(day)}
                    </p>
                  </div>
                </div>
                <div className="mt-7 flex items-baseline justify-between">
                  <h2 className="font-semibold">Your day</h2>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {verified}/{tasks.length}
                  </span>
                </div>
                <Progress
                  value={tasks.length ? (verified / tasks.length) * 100 : 0}
                  aria-label={`${verified} of ${tasks.length} tasks verified`}
                  className="mt-3"
                />
                <div className="mt-4 flex flex-col gap-3">
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
                        href="/profile?tab=tasks"
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
                      One small commitment is a good place to start.
                    </p>
                  )}
                </div>
                <Button
                  nativeButton={false}
                  variant="ghost"
                  className="mt-4 w-full justify-between"
                  render={<Link href="/profile?tab=tasks" />}
                >
                  Your tasks
                  <ArrowRight data-icon="inline-end" />
                </Button>
                <p className="mt-3 text-xs text-muted-foreground">
                  Due at midnight · Phoenix time
                </p>
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
          {navLinks()}
        </nav>
      </div>
    </div>
  );
}
