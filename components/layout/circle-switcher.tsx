"use client";

import { Check, ChevronsUpDown, Gauge, Shield, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";
import { cn } from "@/lib/utils";

export type ShellCircle = {
  id: string;
  name: string;
  role: "OWNER" | "MEMBER";
};

export function CircleSwitcher({
  circles,
  circleId,
  superAdmin,
  variant,
}: {
  circles: ShellCircle[];
  circleId: string;
  superAdmin: boolean;
  variant: "sidebar" | "header";
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const current = circles.find((item) => item.id === circleId);
  const name = current?.name ?? "Pickle Balls";

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "circle-switcher",
              variant === "sidebar" && "circle-switcher-sidebar",
            )}
            aria-label={`Circle menu: ${name}`}
          />
        }
      >
        <span className="circle-mark" aria-hidden="true">
          {name.trim().charAt(0).toUpperCase() || "P"}
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start">
          {variant === "sidebar" && (
            <span className="text-[11px] font-normal text-muted-foreground">
              Circle
            </span>
          )}
          <span className="max-w-full truncate">{name}</span>
        </span>
        <ChevronsUpDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
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
        {(current?.role === "OWNER" || superAdmin) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {current?.role === "OWNER" && (
                <DropdownMenuItem render={<Link href="/admin" />}>
                  <Shield /> Owner tools &amp; invites
                </DropdownMenuItem>
              )}
              {superAdmin && (
                <DropdownMenuItem render={<Link href="/superadmin" />}>
                  <Gauge /> Admin console
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
