import { defineMarkdownComponent } from "@comark/react";
import emoji from "@comark/react/plugins/emoji";
import footnotes from "@comark/react/plugins/footnotes";
import math from "@comark/react/plugins/math";
import mermaid from "@comark/react/plugins/mermaid";
import punctuation from "@comark/react/plugins/punctuation";
import security from "@comark/react/plugins/security";
import shiki from "@comark/react/plugins/shiki";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChangelogMath } from "./changelog-math";
import { ChangelogMermaid } from "./changelog-mermaid";

// Comark resolves `> [!WARNING]` blockquotes (and `::warning` components) by
// the alert name, so one component covers every tone. The tone arrives as the
// `as` prop; per-tone colors live in `.changelog-prose` CSS.
function ChangelogAlert({
  as: tone,
  children,
}: {
  as?: string;
  children?: ReactNode;
}) {
  return (
    <blockquote data-alert={(tone ?? "note").toLowerCase()}>
      {children}
    </blockquote>
  );
}

function ChangelogLink({ href, children, ...rest }: ComponentProps<"a">) {
  const external = href?.startsWith("http://") || href?.startsWith("https://");
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {children}
    </a>
  );
}

// Comark passes fence metadata (filename, language) as props. Only className
// is forwarded — comark-only props like `highlights` are not valid DOM attrs.
function ChangelogPre({
  filename,
  language,
  children,
  className,
}: {
  filename?: string;
  language?: string;
  children?: ReactNode;
  className?: string;
}) {
  if (!filename) return <pre className={className}>{children}</pre>;
  return (
    <div className="changelog-codeblock overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/60 px-3 py-1.5 font-mono text-xs text-muted-foreground">
        <span className="truncate">{filename}</span>
        {language ? (
          <span className="shrink-0 uppercase">{language}</span>
        ) : null}
      </div>
      <pre className={cn(className, "changelog-codeblock-pre")}>{children}</pre>
    </div>
  );
}

function ChangelogTable({ children }: { children?: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table>{children}</table>
    </div>
  );
}

// Full-punch Comark renderer for changelog entries: GFM + component/attribute
// syntax and alerts come from the default plugins; everything below is the
// extra arsenal — emoji shortcodes, footnotes, KaTeX math, Mermaid diagrams,
// smart punctuation, Shiki highlighting, and HTML sanitization.
export const ChangelogMarkdown = defineMarkdownComponent({
  name: "ChangelogMarkdown",
  plugins: [
    emoji(),
    footnotes(),
    math(),
    mermaid(),
    punctuation(),
    shiki({ themes: { light: githubLight, dark: githubDark } }),
    security(),
  ],
  components: {
    math: ChangelogMath,
    mermaid: ChangelogMermaid,
    note: ChangelogAlert,
    tip: ChangelogAlert,
    important: ChangelogAlert,
    warning: ChangelogAlert,
    caution: ChangelogAlert,
    a: ChangelogLink,
    pre: ChangelogPre,
    table: ChangelogTable,
  },
  className: "changelog-prose text-sm leading-relaxed text-muted-foreground",
});
