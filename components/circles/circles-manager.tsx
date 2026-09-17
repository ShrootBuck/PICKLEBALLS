"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { appFetch } from "@/lib/app-refresh";

export type CircleListItem = {
  id: string;
  slug: string;
  name: string;
  role: "OWNER" | "MEMBER";
};

export function CirclesManager({
  initial,
  activeId,
}: {
  initial: CircleListItem[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [circles, setCircles] = useState(initial);
  const [current, setCurrent] = useState(activeId);
  useEffect(() => {
    setCircles(initial);
    setCurrent(activeId);
  }, [initial, activeId]);
  const [createPending, setCreatePending] = useState(false);
  const [switchPending, setSwitchPending] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const busy = createPending || switchPending !== null;

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setCreatePending(true);
    setCreateError(null);
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      const response = await appFetch("/api/circles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: data.name }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
        slug?: string;
        name?: string;
        role?: "OWNER" | "MEMBER";
      };
      if (!response.ok || !body.id) {
        setCreateError(body.error ?? "Could not create the circle.");
      } else {
        setCircles((prev) => [
          ...prev,
          {
            id: body.id as string,
            slug: body.slug ?? "",
            name: (body.name as string) ?? "Circle",
            role: body.role ?? "OWNER",
          },
        ]);
        setCurrent(body.id);
        form.reset();
        router.push("/");
      }
    } catch {
      setCreateError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setCreatePending(false);
    }
  }

  async function switchTo(circleId: string) {
    if (busy) return;
    if (circleId === current) {
      router.push("/");
      return;
    }
    setSwitchPending(circleId);
    setSwitchError(null);
    try {
      const response = await appFetch("/api/circles/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ circleId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setSwitchError(body.error ?? "Could not switch circles.");
      } else {
        setCurrent(circleId);
        router.push("/");
      }
    } catch {
      setSwitchError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setSwitchPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Your circles</CardTitle>
          <CardDescription>
            Posts are only visible to members of their circle.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {circles.length === 0 ? (
            <Empty className="py-7">
              <EmptyHeader>
                <EmptyMedia variant="icon">🎾</EmptyMedia>
                <EmptyTitle>No circles yet</EmptyTitle>
                <EmptyDescription>
                  Create a circle or ask a friend for an invite.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            circles.map((circle) => (
              <div
                key={circle.id}
                className="flex min-w-0 flex-col items-stretch gap-3 rounded-xl border px-3 py-3 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {circle.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {circle.role === "OWNER" ? "Owner" : "Member"}
                    {current === circle.id ? " · current" : ""}
                  </span>
                </div>
                {
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => switchTo(circle.id)}
                    className="w-full sm:w-auto"
                  >
                    {switchPending === circle.id ? (
                      <Spinner data-icon="inline-start" />
                    ) : null}
                    {current === circle.id ? "Open circle" : "Switch"}
                  </Button>
                }
              </div>
            ))
          )}
          {switchError && (
            <Alert variant="destructive">
              <AlertTitle>Could not switch circles</AlertTitle>
              <AlertDescription>{switchError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      <form onSubmit={create}>
        <Card>
          <CardHeader>
            <CardTitle>Start a new circle</CardTitle>
            <CardDescription>
              You become the owner. Invite your people from Owner tools.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-disabled={busy}>
                <FieldLabel htmlFor="circle-name">Circle name</FieldLabel>
                <Input
                  id="circle-name"
                  name="name"
                  placeholder="e.g. Calc study crew"
                  maxLength={40}
                  required
                  disabled={busy}
                  autoComplete="off"
                />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <Button
              type="submit"
              disabled={busy}
              size="lg"
              className="w-full sm:w-auto"
            >
              {createPending ? <Spinner data-icon="inline-start" /> : null}
              {createPending ? "Creating circle…" : "Create circle"}
            </Button>
            {createError ? (
              <Alert variant="destructive">
                <AlertTitle>That did not work.</AlertTitle>
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            ) : null}
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
