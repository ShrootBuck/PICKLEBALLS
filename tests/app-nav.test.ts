import { describe, expect, test } from "bun:test";
import {
  activeNavItem,
  navItems,
  navSectionOf,
  pageLayout,
  visibleNavItems,
} from "@/lib/app-nav";

const active = (path: string) => {
  const url = new URL(path, "http://localhost");
  return activeNavItem(url.pathname, url.searchParams);
};

describe("app navigation", () => {
  test("maps every destination and detail page to one item", () => {
    expect(active("/")).toBe("today");
    expect(active("/timeblock?due=2026-10-12")).toBe("timeblock");
    expect(active("/goals/abc")).toBe("goals");
    expect(active("/streaks/abc?circle=c")).toBe("streaks");
    expect(active("/feed")).toBe("feed");
    expect(active("/posts/proof/abc?circle=c")).toBe("feed");
    expect(active("/squad")).toBe("review");
    expect(active("/squad?view=members")).toBe("members");
    expect(active("/squad?view=log")).toBe("history");
    expect(active("/members/someone?tab=tasks")).toBe("members");
    expect(active("/bucket-list/idea")).toBe("bucket-list");
    expect(active("/screen-time?week=2026-10-04")).toBe("screen-time");
    expect(active("/history?day=2026-10-01")).toBe("history");
    expect(active("/profile?tab=streaks")).toBe("profile");
    expect(active("/settings")).toBe("settings");
    expect(active("/admin")).toBe("owner");
    expect(active("/changelog")).toBe("changelog");
    expect(active("/superadmin/users/abc")).toBe("superadmin");
    expect(active("/goalsx")).toBeNull();
  });

  test("groups items into the four tab bar sections", () => {
    expect(navSectionOf("timeblock")).toBe("today");
    expect(navSectionOf("feed")).toBe("feed");
    expect(navSectionOf("bucket-list")).toBe("squad");
    expect(navSectionOf("settings")).toBe("you");
    expect(navSectionOf(null)).toBeNull();
    expect(new Set(navItems.map((item) => item.id)).size).toBe(navItems.length);
  });

  test("hides owner and admin destinations without access", () => {
    const ids = (owner: boolean, superAdmin: boolean) =>
      visibleNavItems({ owner, superAdmin }).map((item) => item.id);
    expect(ids(false, false)).not.toContain("owner");
    expect(ids(false, false)).not.toContain("superadmin");
    expect(ids(true, false)).toContain("owner");
    expect(ids(false, true)).toContain("superadmin");
  });

  test("keeps feed-shaped pages narrow with the Today panel", () => {
    expect(pageLayout("feed")).toBe("panel");
    expect(pageLayout("profile")).toBe("panel");
    expect(pageLayout("today")).toBe("wide");
    expect(pageLayout("timeblock")).toBe("wide");
    expect(pageLayout("settings")).toBe("narrow");
    expect(pageLayout(null)).toBe("narrow");
  });
});
