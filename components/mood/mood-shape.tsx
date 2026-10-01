"use client";

import { type CSSProperties, useId, useMemo } from "react";
import { moodColor } from "@/lib/mood";
import { cn } from "@/lib/utils";

// Even counts keep each shape point-symmetric, so CSS rotation around the
// layer's fill-box center does not wobble.
const spikes = 10;
const petals = 8;

/** Sharp spikes when unpleasant, a circle at neutral, soft petals when pleasant. */
function shapePath(valence: number) {
  const t = Math.min(1, Math.max(-1, valence / 100));
  const pleasant = t > 0;
  const k = pleasant ? petals : spikes;
  const amplitude = Math.abs(t) * (pleasant ? 0.3 : 0.34);
  const steps = 240;
  let d = "";
  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const wave = pleasant
      ? Math.abs(Math.cos((k * theta) / 2)) ** 0.6
      : 1 - Math.abs(Math.sin((k * theta) / 2)) ** 0.6;
    const r = 100 * (1 - amplitude + amplitude * wave);
    d += `${i ? "L" : "M"}${(r * Math.sin(theta)).toFixed(2)} ${(-r * Math.cos(theta)).toFixed(2)}`;
  }
  return `${d}Z`;
}

export function MoodShape({
  valence,
  size,
  animate = false,
  tint = true,
  className,
}: {
  valence: number;
  size?: number;
  animate?: boolean;
  /** Set false to inherit --mood from a parent, such as an animated launcher. */
  tint?: boolean;
  className?: string;
}) {
  const fill = `mood-fill-${useId().replace(/[^\w-]/g, "")}`;
  const path = useMemo(() => shapePath(valence), [valence]);
  const turn = 180 / (valence > 0 ? petals : spikes);
  return (
    <svg
      viewBox="-100 -100 200 200"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={cn("mood-shape", className)}
      data-animate={animate || undefined}
      style={
        tint ? ({ "--mood": moodColor(valence) } as CSSProperties) : undefined
      }
    >
      <defs>
        <radialGradient id={fill} cx="50%" cy="38%" r="70%">
          <stop offset="0%" className="mood-shape-light" />
          <stop offset="100%" className="mood-shape-base" />
        </radialGradient>
      </defs>
      <g className="mood-shape-spin">
        <path
          d={path}
          fill={`url(#${fill})`}
          opacity={0.3}
          transform={`rotate(${turn})`}
        />
      </g>
      <g className="mood-shape-spin mood-shape-counter">
        <path
          d={path}
          fill={`url(#${fill})`}
          opacity={0.5}
          transform={`rotate(${turn / 2}) scale(0.86)`}
        />
      </g>
      <path d={path} fill={`url(#${fill})`} transform="scale(0.72)" />
    </svg>
  );
}
