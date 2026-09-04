"use client";

import { Math as ComarkMath } from "@comark/react/plugins/math";
import type { ComponentProps } from "react";

// Comark's Math uses hooks but ships without a "use client" boundary, so this
// wrapper marks the client boundary for the App Router.
export function ChangelogMath(props: ComponentProps<typeof ComarkMath>) {
  return <ComarkMath {...props} />;
}
