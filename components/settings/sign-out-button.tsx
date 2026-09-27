"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { disconnectDevicePush } from "@/lib/device-push";

export function SignOutButton() {
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
    <Button variant="outline" disabled={busy} onClick={signOut}>
      <LogOut data-icon="inline-start" />
      {busy ? "Signing out..." : "Sign out"}
    </Button>
  );
}
