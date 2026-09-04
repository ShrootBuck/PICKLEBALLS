"use client";

import { Mermaid as ComarkMermaid } from "@comark/react/plugins/mermaid";
import type { ComponentProps } from "react";

// Comark's Mermaid uses hooks but ships without a "use client" boundary, so
// this wrapper marks the client boundary for the App Router.
export function ChangelogMermaid(props: ComponentProps<typeof ComarkMermaid>) {
  return <ComarkMermaid {...props} />;
}
