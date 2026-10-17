"use client";

import {
  ArrowRight,
  Check,
  LockKeyhole,
  MessageCircle,
  Settings2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleLifecycle } from "@/components/circles/circle-lifecycle";
import {
  CircleNameDialog,
  type SavedCircle,
} from "@/components/circles/circle-name-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { appFetch } from "@/lib/app-refresh";
import { getInitials } from "@/lib/names";
import { cn } from "@/lib/utils";

type CircleMember = {
  id: string;
  name: string;
  image: string | null;
  role: "OWNER" | "MEMBER";
};
export type CircleListItem = SavedCircle & {
  role: "OWNER" | "MEMBER";
  members: CircleMember[];
};

export function CirclesManager({
  initial,
  activeId,
  viewer,
}: {
  initial: CircleListItem[];
  activeId: string | null;
  viewer: { id: string; name: string; image: string | null };
}) {
  const router = useRouter();
  const [circles, setCircles] = useState(initial);
  const [current, setCurrent] = useState(activeId);
  const [selectedId, setSelectedId] = useState(activeId);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setCircles(initial);
    setCurrent(activeId);
  }, [initial, activeId]);
  const selected =
    circles.find((circle) => circle.id === selectedId) ??
    circles.find((circle) => circle.id === current) ??
    circles[0];

  function created(circle: SavedCircle) {
    setCircles((items) => [
      ...items.filter((item) => item.id !== circle.id),
      {
        ...circle,
        role: "OWNER",
        members: [{ ...viewer, role: "OWNER" }],
      },
    ]);
    setCurrent(circle.id);
    setSelectedId(circle.id);
    setError(null);
  }
  function renamed(circle: SavedCircle) {
    setCircles((items) =>
      items.map((item) =>
        item.id === circle.id ? { ...item, ...circle } : item,
      ),
    );
  }
  async function open(
    circle: CircleListItem,
    destination: "/" | "/messages" | "/admin",
  ) {
    if (pending) return;
    setPending(destination);
    setError(null);
    try {
      // Reassert the destination's circle even if a different tab changed the cookie.
      const response = await appFetch("/api/circles/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ circleId: circle.id }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? "Could not open this circle.");
      }
      setCurrent(circle.id);
      router.push(destination);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not connect. Try again.",
      );
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="circles-content">
      <header className="circles-heading">
        <div>
          <h1>
            Circles<span className="text-primary">.</span>
          </h1>
          <p>Open a group or start a circle for your classmates and friends.</p>
        </div>
        {circles.length > 0 && <CircleNameDialog onSaved={created} />}
      </header>
      {circles.length === 0 ? (
        <Empty className="circles-empty">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>Create your group's space</EmptyTitle>
            <EmptyDescription>
              A circle is your private group for tasks, goals, habits, and chat.
              Create one for your classmates or friends.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CircleNameDialog onSaved={created} />
            <p className="text-sm text-muted-foreground">
              Already invited? Open your friend's invite link to join.
            </p>
          </EmptyContent>
        </Empty>
      ) : (
        selected && (
          <div className="circles-workspace">
            <aside className="circles-directory" aria-label="Your circles">
              <h2>
                Your circles <span>{circles.length}</span>
              </h2>
              <div className="circles-list">
                {circles.map((circle) => (
                  <Button
                    key={circle.id}
                    type="button"
                    variant="plain"
                    className={cn(
                      "circles-list-item h-auto whitespace-normal",
                      selected.id === circle.id && "is-selected",
                    )}
                    aria-pressed={selected.id === circle.id}
                    aria-controls="circle-details"
                    disabled={pending !== null}
                    onClick={() => {
                      setSelectedId(circle.id);
                      setError(null);
                    }}
                  >
                    <span className="circles-monogram" aria-hidden="true">
                      {getInitials(circle.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {circle.name}
                      </span>
                      <span className="circles-list-meta">
                        {circle.members.length}{" "}
                        {circle.members.length === 1 ? "member" : "members"} ·{" "}
                        {circle.role === "OWNER" ? "Owner" : "Member"}
                      </span>
                    </span>
                    {current === circle.id && (
                      <span className="circles-current" title="Current circle">
                        <Check className="size-4" />
                        <span className="sr-only">Current circle</span>
                      </span>
                    )}
                  </Button>
                ))}
              </div>
              <p className="circles-directory-note">
                <LockKeyhole className="size-3.5 shrink-0" />
                Only members can see a circle's posts and group chat.
              </p>
            </aside>
            <section
              id="circle-details"
              aria-label={`${selected.name} details`}
              className="circles-detail"
              key={selected.id}
            >
              <div className="circles-overview">
                <div className="flex items-start justify-between gap-4">
                  <span
                    className="circles-monogram circles-monogram-large"
                    aria-hidden="true"
                  >
                    {getInitials(selected.name)}
                  </span>
                  <div className="flex items-center gap-1">
                    {selected.role === "OWNER" && (
                      <CircleNameDialog circle={selected} onSaved={renamed} />
                    )}
                    <CircleLifecycle circle={selected} viewerId={viewer.id} />
                  </div>
                </div>
                <div className="flex flex-col items-start gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      <LockKeyhole /> Private circle
                    </Badge>
                    {current === selected.id && (
                      <Badge variant="secondary">
                        <Check /> Current
                      </Badge>
                    )}
                  </div>
                  <h2 className="circles-name">{selected.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selected.members.length}{" "}
                    {selected.members.length === 1 ? "member" : "members"} ·{" "}
                    {selected.role === "OWNER"
                      ? "You own this circle"
                      : "You're a member"}
                  </p>
                </div>
                <div className="circles-actions">
                  <Button
                    disabled={pending !== null}
                    onClick={() => open(selected, "/")}
                  >
                    {pending === "/" ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <ArrowRight data-icon="inline-start" />
                    )}
                    Open circle
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending !== null}
                    onClick={() => open(selected, "/messages")}
                  >
                    {pending === "/messages" ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <MessageCircle data-icon="inline-start" />
                    )}
                    Messages
                  </Button>
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h3>People</h3>
                  </CardTitle>
                  <CardDescription>
                    {selected.members.length === 1
                      ? "It's just you for now. Invite a friend to get started."
                      : "The people you share this circle with."}
                  </CardDescription>
                  {selected.role === "OWNER" && (
                    <CardAction>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending !== null}
                        onClick={() => open(selected, "/admin")}
                      >
                        {pending === "/admin" ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <Settings2 data-icon="inline-start" />
                        )}
                        Invite &amp; manage
                      </Button>
                    </CardAction>
                  )}
                </CardHeader>
                <CardContent>
                  <ul aria-label="Circle members" className="circles-members">
                    {selected.members.map((member) => (
                      <li key={member.id}>
                        <Avatar className="size-10">
                          <AvatarImage
                            userId={member.id}
                            src={member.image ?? undefined}
                            alt=""
                          />
                          <AvatarFallback>
                            {getInitials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 break-words font-medium">
                          {member.name}
                          {member.id === viewer.id && (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              (you)
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {member.role === "OWNER" ? "Owner" : "Member"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          </div>
        )
      )}
    </div>
  );
}
