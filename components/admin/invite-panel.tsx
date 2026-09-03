"use client";

import { Check, Copy, Link2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const response = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = (await response.json()) as { error?: string; url?: string };
    if (!response.ok) setError(body.error ?? "Invite failed.");
    else {
      setUrl(body.url ?? null);
      form.reset();
      router.refresh();
    }
    setPending(false);
  }
  async function revoke(id: string) {
    setRevokingId(id);
    setError(null);
    const response = await fetch(`/api/admin/invites/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Revoke failed.");
    }
    setRevokingId(null);
    router.refresh();
  }
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <form onSubmit={submit} className="min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>One-time Discord invite</CardTitle>
            <CardDescription>
              The token is stored only as a hash. Copy it now — a lost link
              cannot be shown again. Revoke and reissue instead.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-4">
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
              <Alert className="min-w-0">
                <Link2 />
                <AlertTitle>Copy this now.</AlertTitle>
                <AlertDescription className="flex min-w-0 flex-col gap-3">
                  <span className="block w-full min-w-0 truncate rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs">
                    {url}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(url);
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 2000);
                      } catch {
                        setError(
                          "Clipboard blocked. Select the URL and copy manually.",
                        );
                      }
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
              <Alert variant="destructive">
                <AlertTitle>Invite failed.</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter>
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
        </Card>
      </form>
      <Card>
        <CardHeader>
          <CardTitle>Invite history</CardTitle>
          <CardDescription>
            No email gates. Discord identity plus this one-time link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invites.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>For</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Used by</TableHead>
                    <TableHead className="text-right">Action</TableHead>
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
                        <TableCell className="font-medium">
                          {invite.label ?? "Friend"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              status === "Ready" ? "default" : "secondary"
                            }
                          >
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {invite.expiresAt.slice(0, 10)}
                        </TableCell>
                        <TableCell>{invite.usedBy ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {status === "Ready" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={revokingId === invite.id}
                              onClick={() => revoke(invite.id)}
                            >
                              {revokingId === invite.id ? (
                                <Spinner data-icon="inline-start" />
                              ) : null}
                              Revoke
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Link2 />
                </EmptyMedia>
                <EmptyTitle>No invites</EmptyTitle>
                <EmptyDescription>
                  Small circle only. No growth hacking.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
