"use client";

import { ClipboardCheck, Clock3, LogOut, Shield, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [signOutPending, setSignOutPending] = useState(false);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/" prefetch />}
              isActive={pathname === "/"}
              data-pending={pendingHref === "/" ? "true" : undefined}
            >
              <span aria-hidden="true">🎾</span>
              <span>Pickle Balls</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>School first</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {links.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href;
                const isLinkPending = pendingHref === href && isPending;
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      render={
                        <Link
                          href={href}
                          prefetch
                          onClick={() => {
                            if (!isActive) {
                              setPendingHref(href);
                              startTransition(() => {});
                            }
                          }}
                        />
                      }
                      isActive={isActive}
                      tooltip={label}
                      aria-busy={isLinkPending}
                    >
                      <Icon />
                      <span>{label}</span>
                      {isLinkPending && <Spinner className="ml-auto size-3" />}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {isOwner && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={
                      <Link
                        href="/admin"
                        prefetch
                        onClick={() => {
                          if (pathname !== "/admin") {
                            setPendingHref("/admin");
                            startTransition(() => {});
                          }
                        }}
                      />
                    }
                    isActive={pathname === "/admin"}
                    tooltip="Owner tools"
                    aria-busy={pendingHref === "/admin" && isPending}
                  >
                    <Shield />
                    <span>Owner tools</span>
                    {pendingHref === "/admin" && isPending && (
                      <Spinner className="ml-auto size-3" />
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <Avatar className="size-7">
                <AvatarImage
                  src={user.image ?? undefined}
                  alt={`${user.name} avatar`}
                />
                <AvatarFallback>{user.initials}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.discordUsername
                    ? `@${user.discordUsername}`
                    : "Discord"}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Button
          variant="ghost"
          size="default"
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
