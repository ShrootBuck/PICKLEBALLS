"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  AppSidebar,
  MobileMenu,
  MobileTabBar,
  type NavCounts,
  SectionTabs,
} from "@/components/layout/app-nav";
import {
  CircleSwitcher,
  type ShellCircle,
} from "@/components/layout/circle-switcher";
import { TodayPanel } from "@/components/layout/today-panel";
import { useSocial } from "@/components/social/social-provider";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StopwatchBar } from "@/components/work-sessions/stopwatch-bar";
import {
  activeNavItem,
  navItems,
  navSectionOf,
  navSections,
  pageLayout,
  visibleNavItems,
} from "@/lib/app-nav";
import { useDirectUnread } from "@/lib/direct-message-client";
import { cn } from "@/lib/utils";

export function AppShell({
  circles,
  pendingVerdicts,
  bucketVotes,
  superAdmin,
  bell,
  children,
}: {
  circles: ShellCircle[];
  pendingVerdicts: number;
  bucketVotes: number;
  superAdmin: boolean;
  bell: ReactNode;
  children: ReactNode;
}) {
  const { circleId, scrolls } = useSocial();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const routeKey = `${pathname}?${query}`;
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigating = useRef(false);
  const owner = circles.find((item) => item.id === circleId)?.role === "OWNER";
  const items = useMemo(
    () => visibleNavItems({ owner, superAdmin }),
    [owner, superAdmin],
  );
  const active = activeNavItem(pathname, searchParams);
  const section = navSectionOf(active);
  const layout = pageLayout(active, pathname);
  const unreadMessages = useDirectUnread();
  const counts: NavCounts = {
    verdicts: pendingVerdicts,
    votes: bucketVotes,
    messages: unreadMessages,
  };
  const activeItem = navItems.find((item) => item.id === active);
  const sectionLabel = navSections.find((item) => item.id === section)?.label;

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

  function scrollToTop() {
    navigating.current = false;
    scrollRef.current?.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  return (
    <div
      className="app-shell"
      data-page={active ?? undefined}
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
      <AppSidebar
        items={items}
        active={active}
        counts={counts}
        circles={circles}
        superAdmin={superAdmin}
        onReselect={scrollToTop}
      />
      <div className="app-workspace">
        <header className="app-header">
          <div className="app-header-circle">
            <CircleSwitcher
              circles={circles}
              circleId={circleId}
              superAdmin={superAdmin}
              variant="header"
            />
          </div>
          <p className="app-breadcrumb">
            {sectionLabel && activeItem && sectionLabel !== activeItem.label ? (
              <>
                <span className="text-muted-foreground">{sectionLabel}</span>
                <span aria-hidden="true" className="text-muted-foreground/50">
                  /
                </span>
                <span>{activeItem.label}</span>
              </>
            ) : (
              <span>{activeItem?.label ?? sectionLabel ?? ""}</span>
            )}
          </p>
          <div className="ml-auto flex items-center gap-1">
            <MobileMenu
              items={items}
              active={active}
              counts={counts}
              onReselect={scrollToTop}
            />
            <Link
              href="/messages"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "relative",
              )}
              aria-label={
                unreadMessages
                  ? `Messages, ${unreadMessages} unread`
                  : "Open messages"
              }
            >
              <MessageCircle />
              {unreadMessages > 0 && (
                <Badge className="nav-count">
                  {unreadMessages > 99 ? "99+" : unreadMessages}
                </Badge>
              )}
            </Link>
            {bell}
          </div>
        </header>
        <StopwatchBar />
        <SectionTabs
          items={items.filter((item) => item.section === section)}
          active={active}
          counts={counts}
          onReselect={scrollToTop}
        />
        <div
          ref={scrollRef}
          data-slot="app-scroll"
          className="app-scroll"
          onScroll={(event) => {
            if (!navigating.current)
              scrolls.set(routeKey, event.currentTarget.scrollTop);
          }}
        >
          <div className={cn("app-columns", layout === "wide" && "is-wide")}>
            <main
              id="main"
              tabIndex={-1}
              className={cn("app-content", layout === "wide" && "is-wide")}
            >
              {children}
            </main>
            {layout === "panel" && (
              <TodayPanel pendingVerdicts={pendingVerdicts} />
            )}
          </div>
        </div>
        <MobileTabBar
          section={section}
          counts={counts}
          onReselect={scrollToTop}
        />
      </div>
    </div>
  );
}
