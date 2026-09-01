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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
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

type InviteRow = {
  id: string;
  label: string | null;
  email: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  usedBy: { name: string; email: string } | null;
};

type FieldErrors = Record<string, string[] | undefined>;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function inviteStatus(invite: InviteRow) {
  if (invite.usedAt) return { label: "Used", variant: "secondary" as const };
  if (invite.revokedAt)
    return { label: "Revoked", variant: "destructive" as const };
  if (new Date(invite.expiresAt) <= new Date())
    return { label: "Expired", variant: "outline" as const };
  return { label: "Ready", variant: "default" as const };
}

export function InvitePanel({ invites }: { invites: InviteRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});
    setNewLink(null);
    setCopied(false);

    const form = event.currentTarget;
    const label = String(new FormData(form).get("label") ?? "");

    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const result = (await response.json()) as {
        error?: string;
        fields?: FieldErrors;
        url?: string;
      };

      if (!response.ok || !result.url) {
        setError(result.error ?? "Could not create the invite.");
        setFieldErrors(result.fields ?? {});
        return;
      }

      setNewLink(result.url);
      form.reset();
      router.refresh();
    } catch {
      setError("The server tripped over itself. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    if (!newLink) return;
    await navigator.clipboard.writeText(newLink);
    setCopied(true);
  }

  return (
    <div className="admin-grid">
      <Card>
        <CardHeader>
          <CardTitle>Make a one-time invite</CardTitle>
          <CardDescription>
            Seven days to use it. One account. Then the link is dead.
          </CardDescription>
        </CardHeader>
        <form onSubmit={createInvite} noValidate>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(fieldErrors.label)}>
                <FieldLabel htmlFor="label">Who is this for?</FieldLabel>
                <Input
                  id="label"
                  name="label"
                  placeholder="David, Eddie, Khalid…"
                  aria-invalid={Boolean(fieldErrors.label)}
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={fieldErrors.label?.map((message) => ({ message }))}
                />
              </Field>
            </FieldGroup>

            {error && (
              <Alert variant="destructive" className="mt-5">
                <AlertTitle>Invite failed.</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {newLink && (
              <Alert className="mt-5">
                <Link2 aria-hidden="true" />
                <AlertTitle>Copy this now.</AlertTitle>
                <AlertDescription className="flex flex-col gap-3">
                  The raw token is shown once. The database only keeps its hash.
                  <Input value={newLink} readOnly aria-label="New invite URL" />
                  <Button type="button" variant="outline" onClick={copyLink}>
                    {copied ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Copy data-icon="inline-start" />
                    )}
                    {copied ? "Copied" : "Copy invite link"}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="mt-5">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              {pending ? "Making link…" : "Create invite"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invite history</CardTitle>
          <CardDescription>
            You can audit the links. You cannot recover their secret tokens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Link2 />
                </EmptyMedia>
                <EmptyTitle>No invites yet</EmptyTitle>
                <EmptyDescription>
                  Make the first link when one of these fools is ready.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent />
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>For</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Account</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => {
                  const status = inviteStatus(invite);
                  return (
                    <TableRow key={invite.id}>
                      <TableCell>
                        {invite.label ?? invite.email ?? "Invite"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>{formatDate(invite.expiresAt)}</TableCell>
                      <TableCell>
                        {invite.usedBy?.name ?? invite.usedBy?.email ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
