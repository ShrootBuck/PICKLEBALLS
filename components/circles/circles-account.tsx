"use client";

import { UserRound } from "lucide-react";
import { AccountSettings } from "@/components/settings/account-settings";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CirclesAccount({
  userId,
  chatId,
}: {
  userId: string;
  chatId?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" />}>
        <UserRound data-icon="inline-start" /> Account
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Account settings</DialogTitle>
          <DialogDescription>
            Manage your sign-in and account.
          </DialogDescription>
        </DialogHeader>
        <AccountSettings
          userId={userId}
          chatId={chatId}
          showCirclesLink={false}
        />
        <div className="flex justify-start">
          <SignOutButton />
        </div>
      </DialogContent>
    </Dialog>
  );
}
