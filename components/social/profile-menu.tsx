"use client";
import {
  History,
  LogOut,
  MoreHorizontal,
  ScrollText,
  Settings,
  Shield,
  Users,
} from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { disconnectDevicePush } from "@/lib/device-push";

export function ProfileMenu({ isOwner }: { isOwner: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await disconnectDevicePush();
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed");
      router.replace("/sign-in");
      router.refresh();
    } catch {
      toast.add({ title: "Could not sign out. Try again.", type: "error" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Profile menu" />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Your account & circle</DropdownMenuLabel>
          <DropdownMenuItem render={<Link href="/settings" />}>
            <Settings /> Settings
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/history" />}>
            <History /> Circle history
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/circles" />}>
            <Users /> Manage circles
          </DropdownMenuItem>
          {isOwner && (
            <DropdownMenuItem render={<Link href="/admin" />}>
              <Shield /> Owner tools & invites
            </DropdownMenuItem>
          )}
          <DropdownMenuItem render={<Link href="/changelog" />}>
            <ScrollText /> What’s new
          </DropdownMenuItem>
          <DropdownMenuItem disabled={busy} onClick={signOut}>
            <LogOut />
            {busy ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
