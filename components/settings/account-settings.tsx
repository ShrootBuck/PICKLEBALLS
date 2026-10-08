"use client";
import Link from "next/link";
import { useState } from "react";
import { DeleteAction } from "@/components/settings/delete-action";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";

export function AccountSettings({
  userId,
  chatId,
}: {
  userId: string;
  chatId?: string;
}) {
  const [busy, setBusy] = useState(false);
  async function reauthenticate() {
    setBusy(true);
    try {
      const out = await authClient.signOut();
      if (out.error) throw new Error("Could not sign out.");
      const result = await authClient.signIn.social({
        provider: "discord",
        callbackURL: "/circles",
      });
      if (result.error) throw new Error(result.error.message);
    } catch {
      toast.add({
        title: "Could not sign in again. Try signing out and back in.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Account and circles</CardTitle>
        <CardDescription>
          Leave circles, transfer ownership, or permanently delete your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Before deleting your account, transfer or delete every circle you own.
          Sign in again if your last sign-in was more than 10 minutes ago.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/circles" />}
          >
            Manage circles
          </Button>
          <Button variant="outline" disabled={busy} onClick={reauthenticate}>
            {busy ? "Opening Discord..." : "Sign in again"}
          </Button>
          <DeleteAction
            label="Delete account"
            title="Permanently delete your account?"
            description="This removes your profile, sign-ins, personal posts, goals, streaks, Screen Time, and private chat. Your uploaded files are queued for permanent removal. Shared plans and review decisions on other people's proof remain attributed to Deleted member, with your review text removed. This cannot be undone."
            endpoint="/api/account"
            confirmationText="DELETE"
            redirectTo="/sign-in"
            onDeleted={() => {
              try {
                for (const key of Object.keys(localStorage)) {
                  if (
                    key.startsWith(`pb-timeblock:${userId}:`) ||
                    key.startsWith(`screen-time-read:${userId}:`) ||
                    (chatId && key.startsWith(`pb-chat:${chatId}:`))
                  )
                    localStorage.removeItem(key);
                }
              } catch {
                /* Account deletion succeeded even if browser storage is disabled. */
              }
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
