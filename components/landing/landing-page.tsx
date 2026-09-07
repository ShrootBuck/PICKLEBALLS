import { ArrowUpRight, Camera, Clock3, Users } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const points = [
  {
    icon: Camera,
    title: "Photo receipts",
    body: "Prove the work with a photo, not a vibe.",
  },
  {
    icon: Users,
    title: "Friends verify",
    body: "One approval passes. One challenge sends it back.",
  },
  {
    icon: Clock3,
    title: "Midnight deadline",
    body: "Phoenix time. Same clock for everyone.",
  },
];

const steps = [
  { n: "1", text: "Promise something every day." },
  { n: "2", text: "Post photo proof before midnight." },
  { n: "3", text: "Your circle verifies or calls bullshit." },
];

export function LandingPage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-col items-center gap-10 px-5 py-6 text-center sm:gap-14 sm:px-8 sm:py-8">
      <div className="flex w-full items-center gap-2.5 border-b pb-6 text-sm font-semibold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-base text-primary-foreground">
          <span aria-hidden="true">🎾</span>
        </span>
        <strong className="tracking-tight">Pickle Balls</strong>
        <Badge variant="secondary" className="ml-auto">
          Private circles
        </Badge>
      </div>

      <div className="flex flex-col items-center gap-6 pt-6 sm:pt-12">
        <h1 className="max-w-3xl text-5xl font-semibold leading-[1.08] tracking-[-0.045em] text-balance sm:text-7xl">
          Do the homework. Earn the court.
        </h1>
        <p className="max-w-lg text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
          Daily promises, photo receipts, and friends who call the bluff. Start
          your own private circle in seconds — or join your crew with an invite
          link.
        </p>
        <div className="mt-2 flex w-full max-w-sm flex-col gap-2 sm:w-auto sm:max-w-none sm:flex-row">
          <Button
            size="lg"
            className="w-full sm:w-auto"
            nativeButton={false}
            render={<Link href="/sign-up" />}
          >
            Start your circle
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full sm:w-auto"
            nativeButton={false}
            render={<Link href="/sign-in" />}
          >
            Sign in
          </Button>
        </div>
      </div>

      <div className="grid w-full gap-3 text-left sm:grid-cols-3">
        {points.map(({ icon: Icon, title, body }) => (
          <Card key={title}>
            <CardHeader className="gap-3">
              <Icon
                aria-hidden="true"
                className="mb-2 size-5 text-muted-foreground"
              />
              <CardTitle>{title}</CardTitle>
              <CardDescription>{body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <ol className="grid w-full gap-5 text-left sm:grid-cols-3">
        {steps.map((step) => (
          <li key={step.n} className="flex items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted text-xs font-medium text-muted-foreground">
              {step.n}
            </span>
            <span className="pt-1 text-sm text-muted-foreground">
              {step.text}
            </span>
          </li>
        ))}
      </ol>

      <Separator />
      <div className="flex flex-col items-center gap-2 pb-4 text-sm text-muted-foreground">
        <p>Every circle is private. No audience, no feed.</p>
        <Link
          href="https://github.com/ShrootBuck/PICKLEBALLS"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          Open source · ShrootBuck/PICKLEBALLS
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}
