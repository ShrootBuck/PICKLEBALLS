import { ArrowUpRight, Check, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <Link href="/" className="social-wordmark w-fit">
          <span className="brand-symbol">p.</span> Pickle Balls
        </Link>
        <div className="flex max-w-lg flex-col gap-5">
          <Badge variant="outline" className="w-fit">
            <Users /> Your people. Your progress.
          </Badge>
          <h1 className="text-4xl font-semibold leading-[1.06] tracking-[-0.05em] text-balance sm:text-6xl">
            Show up.
            <br />
            Show your work.
          </h1>
          <p className="max-w-sm text-base leading-relaxed text-muted-foreground">
            A private place to make plans, post the receipts, and keep your
            friends moving.
          </p>
          <div className="hidden flex-col gap-4 pt-5 lg:flex">
            {[
              "Make a promise for today.",
              "Share proof before midnight.",
              "Get a verdict from your circle.",
            ].map((text) => (
              <p key={text} className="flex items-center gap-3 text-sm">
                <Check className="size-4 text-primary" />
                {text}
              </p>
            ))}
          </div>
        </div>
        <Link
          href="https://github.com/ShrootBuck/PICKLEBALLS"
          target="_blank"
          rel="noreferrer"
          className="hidden w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground lg:flex"
        >
          Built for small circles. Open source.
          <ArrowUpRight className="size-3" />
        </Link>
      </section>
      <section className="auth-form">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
