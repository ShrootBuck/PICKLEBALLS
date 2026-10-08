"use client";
import { useState } from "react";
import type { CircleListItem } from "@/components/circles/circles-manager";
import { DeleteAction } from "@/components/settings/delete-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CircleLifecycle({ circle }: { circle: CircleListItem }) {
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/circles/${circle.id}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMembers(result.members);
    } catch {
      setError("Could not load members. Close this dialog and try again.");
    } finally {
      setLoading(false);
    }
  }
  if (circle.role !== "OWNER")
    return (
      <DeleteAction
        label="Leave circle"
        title={`Leave ${circle.name}?`}
        description="Your existing posts and reviews stay in the circle. You lose access until someone invites you back. Remove any personal posts you don't want to keep before leaving."
        endpoint={`/api/circles/${circle.id}`}
        method="PATCH"
        body={{ action: "leave" }}
        redirectTo="/circles"
      />
    );
  return (
    <div className="flex flex-wrap gap-1">
      <Dialog
        onOpenChange={(open) => {
          if (open) void load();
        }}
      >
        <DialogTrigger render={<Button size="sm" variant="ghost" />}>
          Transfer ownership
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer {circle.name}</DialogTitle>
            <DialogDescription>
              The new owner can manage members and delete the circle. You become
              a regular member and can leave afterward.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <output>Loading members...</output>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : members.length === 0 ? (
            <p>
              No other members. Invite someone first, or delete this circle.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
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
      />
    </div>
  );
}
