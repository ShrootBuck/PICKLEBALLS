"use client";

import { useEffect } from "react";

// Mobile keyboards shrink the visible viewport without changing dvh. Keep
// dialogs and sheets inside the area the user can actually see and touch.
export function VisualViewportSync() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const style = document.documentElement.style;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Preserve normal panning and magnification when the user pinch-zooms.
        if (Math.abs(viewport.scale - 1) > 0.01) return;
        style.setProperty("--visual-viewport-height", `${viewport.height}px`);
        style.setProperty("--visual-viewport-top", `${viewport.offsetTop}px`);
        style.setProperty(
          "--visual-viewport-bottom",
          `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`,
        );
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      style.removeProperty("--visual-viewport-height");
      style.removeProperty("--visual-viewport-top");
      style.removeProperty("--visual-viewport-bottom");
    };
  }, []);
  return null;
}
