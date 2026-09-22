"use client";
import { MarkdownClient } from "@comark/react";
import security from "@comark/react/plugins/security";
import type { ReactNode } from "react";

const plugins = [security()];
const components = {
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href && /^(https?:|mailto:)/i.test(href) ? href : undefined}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  // Do not let model-authored Markdown load third-party tracking images.
  img: ({ alt }: { alt?: string }) => <span>{alt || "Image"}</span>,
};
export function ChatMarkdown({ text }: { text: string }) {
  return (
    <MarkdownClient
      value={text}
      plugins={plugins}
      components={components}
      className="timeblock-chat-prose"
      streaming
    />
  );
}
