import type { ReactNode } from "react";

export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-brand" aria-label="Pickle Balls">
        <div className="wordmark auth-wordmark">
          <span className="ball-mark">
            <i />
            <i />
          </span>
          <span>
            <strong>PICKLE</strong>
            <strong>BALLS</strong>
          </span>
        </div>
        <div className="auth-manifesto">
          <span>THE DEAL</span>
          <h1>
            Stop saying
            <br />
            <em>“I had no time.”</em>
          </h1>
          <p>
            You had time. You fed it to a rectangle. Your friends are here to
            call that bullshit.
          </p>
        </div>
        <p className="auth-fine-print">
          No productivity cosplay. Just promises, receipts, and consequences.
        </p>
      </section>
      <section className="auth-form-side">{children}</section>
    </main>
  );
}
