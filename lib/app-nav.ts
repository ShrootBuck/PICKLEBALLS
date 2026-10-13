export type NavSectionId = "today" | "feed" | "squad" | "you";

export type NavItemId =
  | "today"
  | "timeblock"
  | "goals"
  | "streaks"
  | "feed"
  | "review"
  | "members"
  | "bucket-list"
  | "screen-time"
  | "history"
  | "profile"
  | "settings"
  | "owner"
  | "changelog"
  | "superadmin";

export type NavItem = {
  id: NavItemId;
  label: string;
  href: string;
  section: NavSectionId;
  badge?: "verdicts" | "votes";
  access?: "owner" | "superadmin";
};

export const navSections: {
  id: NavSectionId;
  label: string;
  href: string;
}[] = [
  { id: "today", label: "Today", href: "/" },
  { id: "feed", label: "Feed", href: "/feed" },
  { id: "squad", label: "Squad", href: "/squad" },
  { id: "you", label: "You", href: "/profile" },
];

export const navItems: NavItem[] = [
  { id: "today", label: "Today", href: "/", section: "today" },
  { id: "timeblock", label: "Timeblock", href: "/timeblock", section: "today" },
  { id: "goals", label: "Goals", href: "/goals", section: "today" },
  { id: "streaks", label: "Streaks", href: "/streaks", section: "today" },
  { id: "feed", label: "Feed", href: "/feed", section: "feed" },
  {
    id: "review",
    label: "Review",
    href: "/squad",
    section: "squad",
    badge: "verdicts",
  },
  {
    id: "members",
    label: "Members",
    href: "/squad?view=members",
    section: "squad",
  },
  {
    id: "bucket-list",
    label: "Bucket list",
    href: "/bucket-list",
    section: "squad",
    badge: "votes",
  },
  {
    id: "screen-time",
    label: "Screen time",
    href: "/screen-time",
    section: "squad",
  },
  { id: "history", label: "History", href: "/history", section: "squad" },
  { id: "profile", label: "Profile", href: "/profile", section: "you" },
  { id: "settings", label: "Settings", href: "/settings", section: "you" },
  {
    id: "owner",
    label: "Owner tools",
    href: "/admin",
    section: "you",
    access: "owner",
  },
  { id: "changelog", label: "What's new", href: "/changelog", section: "you" },
  {
    id: "superadmin",
    label: "Admin console",
    href: "/superadmin",
    section: "you",
    access: "superadmin",
  },
];

function under(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function activeNavItem(
  pathname: string,
  search: URLSearchParams,
): NavItemId | null {
  if (pathname === "/") return "today";
  if (under(pathname, "/timeblock")) return "timeblock";
  if (under(pathname, "/goals")) return "goals";
  if (under(pathname, "/streaks")) return "streaks";
  if (under(pathname, "/feed") || under(pathname, "/posts")) return "feed";
  if (under(pathname, "/squad")) {
    const view = search.get("view");
    return view === "members"
      ? "members"
      : view === "log"
        ? "history"
        : "review";
  }
  if (under(pathname, "/members")) return "members";
  if (under(pathname, "/bucket-list")) return "bucket-list";
  if (under(pathname, "/screen-time")) return "screen-time";
  if (under(pathname, "/history")) return "history";
  if (under(pathname, "/profile")) return "profile";
  if (under(pathname, "/settings")) return "settings";
  if (under(pathname, "/admin")) return "owner";
  if (under(pathname, "/changelog")) return "changelog";
  if (under(pathname, "/superadmin")) return "superadmin";
  return null;
}

export function navSectionOf(item: NavItemId | null): NavSectionId | null {
  return navItems.find((entry) => entry.id === item)?.section ?? null;
}

export function visibleNavItems(access: {
  owner: boolean;
  superAdmin: boolean;
}) {
  return navItems.filter(
    (item) =>
      !item.access ||
      (item.access === "owner" && access.owner) ||
      (item.access === "superadmin" && access.superAdmin),
  );
}

// Wide pages hold boards, calendars, and grids. Feed-shaped pages keep a
// readable column and get the Today panel beside them on large screens.
const widePages = new Set<NavItemId>([
  "today",
  "timeblock",
  "goals",
  "streaks",
  "members",
  "bucket-list",
  "screen-time",
  "history",
  "owner",
  "settings",
  "changelog",
  "superadmin",
]);
const panelPages = new Set<NavItemId>(["feed", "review", "profile"]);

export function pageLayout(item: NavItemId | null, pathname = "") {
  if (item === "members" && pathname.startsWith("/members/"))
    return "panel" as const;
  if (item === "bucket-list" && pathname.startsWith("/bucket-list/"))
    return "narrow" as const;
  if (item && widePages.has(item)) return "wide" as const;
  if (item && panelPages.has(item)) return "panel" as const;
  return "narrow" as const;
}
