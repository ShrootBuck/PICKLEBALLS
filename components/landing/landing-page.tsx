import {
  ArrowRight,
  BadgeCheck,
  Camera,
  Heart,
  MessageCircle,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function LandingPage() {
  return (
    <main className="mx-auto flex min-h-full max-w-6xl flex-col gap-12 px-5 py-6 sm:px-10 sm:py-8">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="social-wordmark">
          <span className="brand-symbol">p.</span> Pickle Balls
        </Link>
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link href="/sign-in" />}
        >
          Sign in
          <ArrowRight />
        </Button>
      </header>
      <section className="grid items-center gap-14 py-4 sm:py-12 lg:grid-cols-2 lg:gap-20">
        <div className="flex flex-col items-start gap-6">
          <Badge variant="outline">
            <Users /> Private social accountability
          </Badge>
          <h1 className="text-5xl font-semibold leading-[1.04] tracking-[-0.055em] text-balance sm:text-7xl">
            Show up.
            <br />
            Show your work.
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
            The group chat energy. The receipts to back it up. Make plans, post
            your progress, and keep each other honest.
          </p>
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/sign-up" />}
          >
            Find your follow-through
            <ArrowRight />
          </Button>
          <p className="text-xs text-muted-foreground">
            Start a circle or join your friends with an invite.
          </p>
        </div>
        <section
          className="landing-feed"
          aria-label="An example of a private circle feed"
        >
          <div className="flex items-center gap-2 border-b pb-5 text-sm font-semibold">
            <Users className="size-4 text-primary" /> The after-school crew{" "}
            <Badge variant="secondary" className="ml-auto">
              Private
            </Badge>
          </div>
          <div className="flex gap-5 py-5">
            {[
              ["YO", "You", "2/3"],
              ["ED", "Eddie", "3/3"],
              ["SA", "Sam", "1/2"],
            ].map(([initials, name, count]) => (
              <div key={name} className="flex flex-col items-center gap-1.5">
                <Avatar className="size-12 ring-2 ring-primary/60 ring-offset-4 ring-offset-background">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="mt-1 text-xs">{name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {count} verified
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 border-t py-4">
            <Avatar>
              <AvatarFallback>ED</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col">
              <strong className="text-sm">Eddie</strong>
              <span className="text-xs text-muted-foreground">
                Finished the problem set · 12m
              </span>
            </div>
            <Badge variant="success">
              <BadgeCheck />
              Verified
            </Badge>
          </div>
          <div className="landing-receipt">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Camera className="size-4" /> THE RECEIPTS
            </div>
            <p className="mt-5 text-2xl font-medium tracking-tight">
              One less thing
              <br />
              on tomorrow’s list.
            </p>
            <div className="mt-6 flex flex-col gap-3" aria-hidden="true">
              <div className="h-px w-full bg-border" />
              <div className="h-px w-4/5 bg-border" />
              <div className="h-px w-3/5 bg-border" />
            </div>
          </div>
          <div className="flex items-center gap-3 py-4 text-sm">
            <Heart className="size-5 text-primary" />3
            <MessageCircle className="ml-2 size-5" />2
            <span className="ml-auto text-xs text-muted-foreground">
              Nice. Same time tomorrow?
            </span>
          </div>
        </section>
      </section>
      <ol className="grid gap-8 border-t py-8 sm:grid-cols-3">
        {[
          ["01", "Commit to something.", "A clear task. A real finish line."],
          [
            "02",
            "Post the proof.",
            "Photos, videos, and check-ins from your day.",
          ],
          [
            "03",
            "Keep each other going.",
            "A friend verifies the work. Everyone sees the progress.",
          ],
        ].map(([n, title, body]) => (
          <li key={n}>
            <span className="text-xs text-primary">{n}</span>
            <h2 className="mt-3 text-base font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
      <footer className="pb-5 text-xs text-muted-foreground">
        Your circle is invite-only. Your progress stays with your people.
      </footer>
    </main>
  );
}
