"use client";

import { AlertCircle, ArrowRight, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { signInSchema, signUpSchema } from "@/lib/auth-validation";

type AuthMode = "sign-in" | "sign-up";
type FieldErrors = Record<string, string[] | undefined>;

const copy = {
  "sign-in": {
    eyebrow: "BACK TO WORK",
    title: "Get back in.",
    description:
      "We know ur gonna do some bullshit today. At least make it visible.",
    submit: "Sign in",
    alternate: "No account?",
    alternateAction: "Use a squad invite",
    alternateHref: "/sign-up",
  },
  "sign-up": {
    eyebrow: "INVITE ONLY",
    title: "Join the accountability group.",
    description:
      "Your friends will see the promises, the receipts, and the excuses. Good.",
    submit: "Create account",
    alternate: "Already joined?",
    alternateAction: "Sign in",
    alternateHref: "/sign-in",
  },
} satisfies Record<AuthMode, Record<string, string>>;

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const content = copy[mode];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const data = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = (mode === "sign-in" ? signInSchema : signUpSchema).safeParse(
      data,
    );

    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      setPending(false);
      return;
    }

    try {
      if (mode === "sign-in") {
        const result = await authClient.signIn.email({
          ...signInSchema.parse(data),
          callbackURL: new URL("/", window.location.origin).toString(),
        });

        if (result.error) {
          setError("Invalid email or password.");
          return;
        }
      } else {
        const response = await fetch("/api/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(signUpSchema.parse(data)),
        });
        const result = (await response.json()) as {
          error?: string;
          fields?: FieldErrors;
        };

        if (!response.ok) {
          setError(result.error ?? "Could not create the account.");
          setFieldErrors(result.fields ?? {});
          return;
        }
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("The server tripped over itself. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-[460px]">
      <CardHeader>
        <div className="auth-kicker">
          <LockKeyhole aria-hidden="true" />
          {content.eyebrow}
        </div>
        <CardTitle>{content.title}</CardTitle>
        <CardDescription>{content.description}</CardDescription>
        <CardAction>
          <span className="auth-step">{mode === "sign-in" ? "01" : "02"}</span>
        </CardAction>
      </CardHeader>

      <form onSubmit={submit} noValidate>
        <CardContent>
          <FieldGroup>
            {mode === "sign-up" && (
              <Field data-invalid={Boolean(fieldErrors.name)}>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  placeholder="What your friends call you"
                  aria-invalid={Boolean(fieldErrors.name)}
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={fieldErrors.name?.map((message) => ({ message }))}
                />
              </Field>
            )}

            <Field data-invalid={Boolean(fieldErrors.email)}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={Boolean(fieldErrors.email)}
                disabled={pending}
                required
              />
              <FieldError
                errors={fieldErrors.email?.map((message) => ({ message }))}
              />
            </Field>

            <Field data-invalid={Boolean(fieldErrors.password)}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === "sign-in" ? "current-password" : "new-password"
                }
                aria-invalid={Boolean(fieldErrors.password)}
                disabled={pending}
                required
              />
              {mode === "sign-up" && (
                <FieldDescription>
                  At least 12 characters. “password123” is clown behavior.
                </FieldDescription>
              )}
              <FieldError
                errors={fieldErrors.password?.map((message) => ({ message }))}
              />
            </Field>

            {mode === "sign-up" && (
              <Field data-invalid={Boolean(fieldErrors.inviteCode)}>
                <FieldLabel htmlFor="inviteCode">Squad code</FieldLabel>
                <Input
                  id="inviteCode"
                  name="inviteCode"
                  autoComplete="off"
                  placeholder="Get it from a friend"
                  aria-invalid={Boolean(fieldErrors.inviteCode)}
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={fieldErrors.inviteCode?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
            )}
          </FieldGroup>

          {error && (
            <Alert variant="destructive" className="mt-5">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>That didn’t work.</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="mt-5 flex-col gap-3">
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <Spinner data-icon="inline-start" />
                Working…
              </>
            ) : (
              <>
                {content.submit}
                <ArrowRight data-icon="inline-end" />
              </>
            )}
          </Button>
          <p className="auth-alternate">
            {content.alternate}{" "}
            <Link
              href={content.alternateHref}
              className={buttonVariants({ variant: "link", size: "sm" })}
            >
              {content.alternateAction}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
