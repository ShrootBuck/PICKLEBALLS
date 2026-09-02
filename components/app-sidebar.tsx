"use client";

import { ClipboardCheck, Clock3, LogOut, Shield, Users } from "lucide-react";
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
import { authClient } from "@/lib/auth-client";

const links = [
  { href: "/", label: "Today", icon: ClipboardCheck },
  { href: "/squad", label: "Squad", icon: Users },
  { href: "/screen-time", label: "Screen Time", icon: Clock3 },
];

export function AppSidebar({
  user,
  isOwner,
}: {
  user: {
    name: string;
    image: string | null;
    initials: string;
    discordUsername: string | null;
  };
  isOwner: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile } = useSidebar();
  const [signOutPending, setSignOutPending] = useState(false);
  const handle = user.discordUsername
    ? `@${user.discordUsername}`
    : "Discord member";

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/" prefetch />}
              isActive={pathname === "/"}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-base text-sidebar-primary-foreground">
                <span aria-hidden="true">🎾</span>
              </span>
              <span className="flex min-w-0 flex-col items-start">
                <span className="truncate text-sm font-semibold tracking-tight">
                  Pickle Balls
                </span>
                <span className="truncate text-xs font-normal text-sidebar-accent-foreground/70">
                  School first
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Day</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {links.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    render={<Link href={href} prefetch />}
                    isActive={pathname === href}
                    tooltip={label}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isOwner ? (
          <SidebarGroup>
            <SidebarGroupLabel>Owner</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/admin" prefetch />}
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
                  <span className="truncate text-xs text-sidebar-accent-foreground/70">
                    {handle}
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
                    {handle}
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={signOutPending}
                    onClick={async () => {
                      setSignOutPending(true);
                      try {
                        await authClient.signOut({
                          fetchOptions: {
                            onSuccess: () => {
                              router.replace("/sign-in");
                              router.refresh();
                            },
                          },
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
