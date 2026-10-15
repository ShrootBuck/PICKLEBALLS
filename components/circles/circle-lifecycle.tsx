"use client";

import { ArrowRightLeft, LogOut, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CircleListItem } from "@/components/circles/circles-manager";
import { DeleteAction } from "@/components/settings/delete-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function CircleLifecycle({
  circle,
  viewerId,
}: {
  circle: CircleListItem;
  viewerId: string;
}) {
  const [action, setAction] = useState<"transfer" | "delete" | "leave" | null>(
    null,
  );
  const members = circle.members.filter((member) => member.id !== viewerId);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Circle options"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {circle.role === "OWNER" ? (
              <>
                <DropdownMenuItem onClick={() => setAction("transfer")}>
                  <ArrowRightLeft />
                  Transfer ownership
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setAction("delete")}
                >
                  <Trash2 />
                  Delete circle
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setAction("leave")}
              >
                <LogOut />
                Leave circle
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {circle.role === "OWNER" ? (
        <>
          <Dialog
            open={action === "transfer"}
            onOpenChange={(open) => {
              if (!open) setAction(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Transfer {circle.name}</DialogTitle>
                <DialogDescription>
                  The new owner can manage members and delete the circle. You
                  become a regular member and can leave afterward.
                </DialogDescription>
              </DialogHeader>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Invite someone before transferring ownership.
                </p>
              ) : (
                <div className="flex flex-col items-start gap-2">
                  {members.map((member) => (
                    <DeleteAction
                      key={member.id}
                      label={`Make ${member.name} owner`}
                      title={`Transfer ownership to ${member.name}?`}
                      description="You will lose owner permissions. Only an owner can transfer them back to you."
                      endpoint={`/api/circles/${circle.id}`}
                      method="PATCH"
                      body={{ action: "transfer", successorId: member.id }}
                      redirectTo="/circles"
                    />
                  ))}
                </div>
              )}
            </DialogContent>
          </Dialog>
          <DeleteAction
            label="Delete circle"
            title={`Delete ${circle.name}?`}
            description="This permanently removes the circle and everyone's tasks, posts, goals, streaks, Screen Time, and bucket-list plans in it. Their accounts and other circles stay intact. Uploaded files are queued for removal. This cannot be undone."
            endpoint={`/api/circles/${circle.id}`}
            method="PATCH"
            body={{ action: "delete" }}
            confirmationText={circle.name}
            redirectTo="/circles"
            hideTrigger
            open={action === "delete"}
            onOpenChange={(open) => {
              if (!open) setAction(null);
            }}
          />
        </>
      ) : (
        <DeleteAction
          label="Leave circle"
          title={`Leave ${circle.name}?`}
          description="Your existing posts and reviews stay in the circle. You lose access until someone invites you back. Remove any personal posts you don't want to keep before leaving."
          endpoint={`/api/circles/${circle.id}`}
          method="PATCH"
          body={{ action: "leave" }}
          redirectTo="/circles"
          hideTrigger
          open={action === "leave"}
          onOpenChange={(open) => {
            if (!open) setAction(null);
          }}
        />
      )}
    </>
  );
}
