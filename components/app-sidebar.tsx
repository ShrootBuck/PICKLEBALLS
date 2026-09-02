"use client";

import { ClipboardCheck, Clock3, LogOut, Shield, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  const [signOutPending, setSignOutPending] = useState(false);

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
          <SidebarGroupLabel>Accountability</SidebarGroupLabel>
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
              {isOwner && (
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
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <Avatar className="size-8 ring-1 ring-sidebar-border">
            <AvatarImage
              src={user.image ?? undefined}
              alt={`${user.name} avatar`}
            />
            <AvatarFallback>{user.initials}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-1 flex-col text-left">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-sidebar-accent-foreground/70">
              {user.discordUsername
                ? `@${user.discordUsername}`
                : "Discord member"}
            </span>
          </span>
        </div>
        <Separator className="bg-sidebar-border/60" />
        <Button
          variant="ghost"
          size="sm"
          disabled={signOutPending}
          className="w-full justify-start touch-manipulation"
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
          {signOutPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <LogOut data-icon="inline-start" />
          )}
          Sign out
        </Button>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
