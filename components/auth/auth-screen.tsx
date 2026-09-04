import { ArrowUpRight, Camera, Clock3, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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

export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <section className="relative flex flex-col gap-6 overflow-hidden bg-primary px-5 py-6 text-primary-foreground sm:px-8 sm:py-8 lg:justify-between lg:gap-10 lg:p-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "radial-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="relative flex items-center gap-2.5 text-sm font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary-foreground text-base text-primary">
            <span aria-hidden="true">🎾</span>
          </span>
          <strong className="tracking-tight">Pickle Balls</strong>
          <Badge variant="secondary" className="ml-1">
            Private circles
          </Badge>
        </div>
        <div className="relative flex max-w-xl flex-col gap-3 lg:gap-4">
          <Badge
            variant="secondary"
            className="hidden w-fit uppercase sm:inline-flex"
          >
            The deal
          </Badge>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl lg:text-5xl">
            Do the homework. Earn the court.
          </h1>
          <p className="hidden max-w-md text-sm leading-relaxed text-pretty opacity-85 sm:block sm:text-base lg:text-lg">
            Daily promises, photo receipts, and friends who call the bluff.
            Start your own private circle in seconds — or join your crew with an
            invite link.
          </p>
          <div className="mt-2 hidden gap-3 lg:grid lg:grid-cols-3">
            {points.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="flex flex-col gap-1.5 rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-3"
              >
                <Icon aria-hidden="true" />
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs leading-relaxed opacity-75">{body}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative hidden flex-col gap-3 lg:flex">
          <Separator className="bg-primary-foreground/15" />
          <p className="text-sm opacity-75">
            Every circle is private. No audience, no feed, no productivity
            influencer.
          </p>
          <Link
            href="https://github.com/ShrootBuck/PICKLEBALLS"
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
          >
            Open source · ShrootBuck/PICKLEBALLS
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <section className="flex items-start justify-center bg-background px-4 py-6 sm:px-6 sm:py-8 lg:items-center lg:p-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">Schoolwork accountability</CardTitle>
            <CardDescription>
              Pickleball is the theme. The homework is the point.
            </CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </section>
    </main>
  );
}
