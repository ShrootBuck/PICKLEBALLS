"use client";

import { Check, Copy, Link2, Plus } from "lucide-react";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { appFetch } from "@/lib/app-refresh";

export function InvitePanel() {
  const [pending, setPending] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      const response = await appFetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
        id?: string;
        expiresAt?: string;
      };
      if (!response.ok) {
        setError(body.error ?? "Invite failed.");
      } else {
        setUrl(body.url ?? null);
        form.reset();
      }
    } catch {
      setError("Could not reach the server. Check your wifi and try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="min-w-0">
      <Card>
        <CardHeader>
          <CardTitle>One-time Discord invite</CardTitle>
          <CardDescription>
            Create a one-time link for your friend. Copy it before leaving this
            page; it cannot be shown again.
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
  );
}
