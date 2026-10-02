"use client";

import { Building2, LayoutDashboard, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const sections = [
  { href: "/superadmin", label: "Overview", icon: LayoutDashboard },
  { href: "/superadmin/users", label: "Users", icon: Users },
  { href: "/superadmin/circles", label: "Circles", icon: Building2 },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Admin console sections"
      className="inline-flex max-w-full w-fit items-center gap-1 overflow-x-auto rounded-xl border border-border bg-background p-[3px]"
    >
      {sections.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/superadmin"
            ? pathname === href
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground pressable [--press-scale:0.97] hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4",
              active &&
                "border-primary bg-accent font-semibold text-accent-foreground shadow-sm",
            )}
          >
            <Icon aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
