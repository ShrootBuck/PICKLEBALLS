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
    <main className="grid min-h-svh lg:grid-cols-2">
      <section className="flex flex-col justify-between gap-10 bg-primary p-8 text-primary-foreground md:p-14">
        <div className="flex items-center gap-3">
          <span aria-hidden="true">🎾</span>
          <strong>Pickle Balls</strong>
        </div>
        <div className="flex max-w-xl flex-col gap-5">
          <Badge variant="secondary" className="w-fit">
            THE DEAL
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
            Do the homework. Earn the court.
          </h1>
          <p className="text-lg">
            Three daily promises, photo receipts, and friends who can approve
            the work or call bullshit.
          </p>
        </div>
        <p className="text-sm">
          This is a private app for friends. There is no audience, funnel, or
          productivity influencer.
        </p>
      </section>
      <section className="flex items-center justify-center p-6 md:p-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Trophy />
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
