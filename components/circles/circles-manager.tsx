"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
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
  const [createPending, setCreatePending] = useState(false);
  const [switchPending, setSwitchPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatePending(true);
    setError(null);
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch("/api/circles", {
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
        setError(body.error ?? "Could not create the circle.");
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
        router.refresh();
      }
    } catch {
      setError("Could not reach the server. Check your wifi and try again.");
    } finally {
      setCreatePending(false);
    }
  }

  async function switchTo(circleId: string) {
    setSwitchPending(circleId);
    setError(null);
    try {
      const response = await fetch("/api/circles/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ circleId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Could not switch circles.");
      } else {
        setCurrent(circleId);
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Could not reach the server. Check your wifi and try again.");
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
            Each circle is its own private world. Switch anytime — nobody sees
            across circles.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {circles.length === 0 ? (
            <Empty className="py-7">
              <EmptyHeader>
                <EmptyMedia variant="icon">🎾</EmptyMedia>
                <EmptyTitle>No circles yet</EmptyTitle>
                <EmptyDescription>
                  Create one below — it takes ten seconds.
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
                    disabled={switchPending !== null || createPending}
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
              <Field>
                <FieldLabel htmlFor="circle-name">Circle name</FieldLabel>
                <Input
                  id="circle-name"
                  name="name"
                  placeholder="e.g. Calc study crew"
                  maxLength={40}
                  required
                  autoComplete="off"
                />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <Button
              type="submit"
              disabled={createPending}
              size="lg"
              className="w-full sm:w-auto"
            >
              {createPending ? <Spinner data-icon="inline-start" /> : null}
              Create circle
            </Button>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>That did not work.</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
