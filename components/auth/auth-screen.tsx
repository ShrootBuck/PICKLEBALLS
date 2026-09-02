import { Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="flex flex-col justify-between gap-8 bg-primary p-6 text-primary-foreground sm:p-8 md:p-10 lg:p-14">
        <div className="flex items-center gap-3 text-sm font-semibold">
          <span aria-hidden="true" className="text-lg">
            🎾
          </span>
          <strong>Pickle Balls</strong>
        </div>
        <div className="flex max-w-xl flex-col gap-4 sm:gap-5">
          <Badge variant="secondary" className="w-fit">
            THE DEAL
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
            Do the homework. Earn the court.
          </h1>
          <p className="text-base sm:text-lg">
            Daily promises, photo receipts, and friends who can approve the work
            or call bullshit.
          </p>
        </div>
        <p className="hidden text-sm opacity-80 sm:block">
          This is a private app for friends. There is no audience, funnel, or
          productivity influencer.
        </p>
      </section>
      <section className="flex items-center justify-center bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 md:p-12">
        <Card className="w-full max-w-md border-foreground/10 shadow-xl shadow-foreground/[0.04]">
          <CardHeader>
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Trophy className="size-4" />
            </div>
            <CardTitle>Schoolwork accountability</CardTitle>
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
