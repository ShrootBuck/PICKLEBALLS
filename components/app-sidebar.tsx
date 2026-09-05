"use client";

import {
  ArrowUpRight,
  CalendarRange,
  Check,
  ClipboardCheck,
  History,
  LogOut,
  Plus,
  ScrollText,
  Shield,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { disconnectDevicePush } from "@/lib/device-push";
import { formatDayShort, phoenixDateKey } from "@/lib/time";

const links = [
  { href: "/", label: "Today", hint: "Your board", icon: ClipboardCheck },
  { href: "/squad", label: "Squad", hint: "Talk + verdicts", icon: Users },
  { href: "/history", label: "History", hint: "Past boards", icon: History },
  {
    href: "/timeblock",
    label: "Timeblock",
    hint: "Weekly PDF",
    icon: CalendarRange,
  },
  {
    href: "/changelog",
    label: "Changelog",
    hint: "What changed",
    icon: ScrollText,
  },
];

export function AppSidebar({
  user,
  isOwner,
  pendingVerdicts,
  activeCircleId,
  circles,
}: {
  user: {
    name: string;
    image: string | null;
    initials: string;
  };
  isOwner: boolean;
  pendingVerdicts: number;
  activeCircleId: string;
  circles: { id: string; name: string; role: "OWNER" | "MEMBER" }[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const [signOutPending, setSignOutPending] = useState(false);
  const [switchPending, setSwitchPending] = useState<string | null>(null);
  const todayLabel = formatDayShort(phoenixDateKey());
  const activeCircle = circles.find((circle) => circle.id === activeCircleId);

  async function switchCircle(circleId: string) {
    if (circleId === activeCircleId || switchPending) return;
    setSwitchPending(circleId);
    try {
      const response = await fetch("/api/circles/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ circleId }),
      });
      if (!response.ok) throw new Error("Could not switch circles.");
      setOpenMobile(false);
      router.push("/");
      router.refresh();
    } catch {
      toast.add({
        title: "Could not switch circles. Try again.",
        type: "error",
      });
    } finally {
      setSwitchPending(null);
    }
  }

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                  />
                }
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-base text-sidebar-primary-foreground">
                  <span aria-hidden="true">🎾</span>
                </span>
                <span className="flex min-w-0 flex-col items-start">
                  <span className="truncate text-sm font-semibold tracking-tight">
                    {activeCircle?.name ?? "Pickle Balls"}
                  </span>
                  <span className="truncate text-xs font-normal text-sidebar-accent-foreground/70">
                    {circles.length > 1
                      ? `${circles.length} circles · switch`
                      : "Proof or bullshit"}
                  </span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-56"
                side={isMobile ? "bottom" : "right"}
                align="start"
                sideOffset={8}
              >
                <DropdownMenuLabel className="font-normal">
                  {circles.length > 1 ? "Switch circle" : "This circle"}
                </DropdownMenuLabel>
                <DropdownMenuGroup>
                  {circles.map((circle) => (
                    <DropdownMenuItem
                      key={circle.id}
                      disabled={
                        switchPending !== null || circle.id === activeCircleId
                      }
                      onClick={() => switchCircle(circle.id)}
                    >
                      {circle.id === activeCircleId ? (
                        <Check data-icon="inline-start" />
                      ) : (
                        <span className="size-4" data-icon="inline-start" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {circle.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {circle.role === "OWNER" ? "Owner" : "Member"}
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    onClick={() => {
                      setOpenMobile(false);
                      router.push("/circles");
                    }}
                  >
                    <Plus data-icon="inline-start" />
                    All circles / new…
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="rounded-lg bg-sidebar-accent px-3 py-2 group-data-[collapsible=icon]:hidden">
          <p className="truncate text-xs font-medium text-sidebar-accent-foreground">
            {todayLabel}
          </p>
          <p className="truncate text-[11px] text-sidebar-accent-foreground/70">
            Deadline at midnight. No mercy.
          </p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Daily grind</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {links.map(({ href, label, hint, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    render={<Link href={href} prefetch />}
                    onClick={() => setOpenMobile(false)}
                    aria-current={pathname === href ? "page" : undefined}
                    isActive={pathname === href}
                    tooltip={`${label} — ${hint}`}
                  >
                    <Icon />
                    <span className="font-medium">{label}</span>
                    {href === "/squad" && pendingVerdicts > 0 ? (
                      <span className="ml-auto rounded-full bg-sidebar-primary px-1.5 text-[11px] font-semibold text-sidebar-primary-foreground tabular-nums group-data-[collapsible=icon]:hidden">
                        {pendingVerdicts}
                      </span>
                    ) : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isOwner ? (
          <SidebarGroup>
            <SidebarGroupLabel>Owner zone</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin" prefetch />}
                    onClick={() => setOpenMobile(false)}
                    aria-current={pathname === "/admin" ? "page" : undefined}
                    isActive={pathname === "/admin"}
                    tooltip="Owner tools"
                  >
                    <Shield />
                    <span>Owner tools</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                  />
                }
              >
                <Avatar className="size-8">
                  <AvatarImage
                    src={user.image ?? undefined}
                    alt={`${user.name} avatar`}
                  />
                  <AvatarFallback>{user.initials}</AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate text-sm font-medium">
                    {user.name}
                  </span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-56"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={8}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    {user.name}
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => {
                      setOpenMobile(false);
                      router.push("/circles");
                    }}
                  >
                    <Users data-icon="inline-start" />
                    All circles / new…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      window.open(
                        "https://github.com/ShrootBuck/PICKLEBALLS",
                        "_blank",
                        "noreferrer",
                      )
                    }
                  >
                    <ArrowUpRight data-icon="inline-start" />
                    GitHub repo
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={signOutPending}
                    onClick={async () => {
                      setSignOutPending(true);
                      try {
                        await disconnectDevicePush();
                        const result = await authClient.signOut({
                          fetchOptions: {
                            onSuccess: () => {
                              router.replace("/sign-in");
                              router.refresh();
                            },
                          },
                        });
                        if (result.error) throw new Error("Sign out failed.");
                      } catch {
                        toast.add({
                          title: "Could not sign out. Try again.",
                          type: "error",
                        });
                      } finally {
                        setSignOutPending(false);
                      }
                    }}
                  >
                    {signOutPending ? <Spinner /> : <LogOut />}
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
