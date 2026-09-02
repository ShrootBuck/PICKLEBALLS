"use client";

import { Check, Copy, Link2, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Invite = {
  id: string;
  label: string | null;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  usedBy: string | null;
};

export function InvitePanel({ invites }: { invites: Invite[] }) {
  const [pending, setPending] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = (await response.json()) as { error?: string; url?: string };
    if (!response.ok) setError(body.error ?? "Invite failed.");
    else setUrl(body.url ?? null);
    setPending(false);
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>One-time Discord invite</CardTitle>
          <CardDescription>
            The token is stored only as a hash. Copy it now.
          </CardDescription>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="invite-label">Friend’s name</FieldLabel>
                <Input
                  id="invite-label"
                  name="label"
                  placeholder="David"
                  maxLength={80}
                  required
                />
              </Field>
            </FieldGroup>
            {url && (
              <Alert className="mt-4">
                <Link2 />
                <AlertTitle>Copy this now.</AlertTitle>
                <AlertDescription className="flex flex-col gap-3">
                  <Input value={url} readOnly aria-label="New invite URL" />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(url);
                      setCopied(true);
                    }}
                  >
                    {copied ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Copy data-icon="inline-start" />
                    )}
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Invite failed.</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="mt-4">
            <Button
              type="submit"
              disabled={pending}
              size="lg"
              className="w-full sm:w-auto touch-manipulation"
            >
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              Create invite
            </Button>
          </CardFooter>
        </form>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Invite history</CardTitle>
          <CardDescription>
            No email gates. Discord identity plus this one-time link.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {invites.length ? (
            <ScrollArea className="w-full whitespace-nowrap">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>For</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Used by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => {
                    const status = invite.usedAt
                      ? "Used"
                      : invite.revokedAt
                        ? "Revoked"
                        : new Date(invite.expiresAt) < new Date()
                          ? "Expired"
                          : "Ready";
                    return (
                      <TableRow key={invite.id}>
                        <TableCell>{invite.label ?? "Friend"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              status === "Ready" ? "default" : "secondary"
                            }
                          >
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell>{invite.usedBy ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Link2 />
                </EmptyMedia>
                <EmptyTitle>No invites</EmptyTitle>
                <EmptyDescription>
                  Correct. This is for four friends, not growth hacking.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
