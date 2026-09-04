import { ArrowUpRight, Camera, Clock3, Users } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col items-center gap-10 px-4 py-10 text-center sm:py-16">
      <div className="flex items-center gap-2.5 text-sm font-semibold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-base text-primary-foreground">
          <span aria-hidden="true">🎾</span>
        </span>
        <strong className="tracking-tight">Pickle Balls</strong>
        <Badge variant="secondary" className="ml-1">
          Private circles
        </Badge>
      </div>

      <div className="flex flex-col items-center gap-4">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Do the homework. Earn the court.
        </h1>
        <p className="max-w-md text-base text-pretty text-muted-foreground sm:text-lg">
          Daily promises, photo receipts, and friends who call the bluff. Start
          your own private circle in seconds — or join your crew with an invite
          link.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Button size="lg" render={<Link href="/sign-up" />}>
            Start your circle
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/sign-in" />}>
            Sign in
          </Button>
        </div>
      </div>

      <div className="grid w-full gap-3 text-left sm:grid-cols-3">
        {points.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="flex flex-col gap-1.5 rounded-xl border bg-card p-4"
          >
            <Icon aria-hidden="true" className="size-5" />
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {body}
            </p>
          </div>
        ))}
      </div>

      <ol className="flex w-full flex-col gap-2 text-left">
        {steps.map((step) => (
          <li
            key={step.n}
            className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {step.n}
            </span>
            <span className="text-sm">{step.text}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
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
