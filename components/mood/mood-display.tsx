"use client";

import {
  Bath,
  Briefcase,
  CloudSun,
  Dumbbell,
  Fingerprint,
  GraduationCap,
  Handshake,
  Heart,
  HeartHandshake,
  HeartPulse,
  House,
  ListChecks,
  type LucideIcon,
  Moon,
  Newspaper,
  Palette,
  Plane,
  Shapes,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { MoodShape } from "@/components/mood/mood-shape";
import {
  type ImpactId,
  impactDetails,
  moodLevelLabel,
  moodStyle,
} from "@/lib/mood";
import { cn } from "@/lib/utils";

const impactIcons: Record<ImpactId, LucideIcon> = {
  school: GraduationCap,
  work: Briefcase,
  tasks: ListChecks,
  friends: Users,
  family: House,
  partner: Heart,
  dating: HeartHandshake,
  community: Handshake,
  health: HeartPulse,
  fitness: Dumbbell,
  sleep: Moon,
  "self-care": Bath,
  hobbies: Palette,
  phone: Smartphone,
  money: Wallet,
  weather: CloudSun,
  travel: Plane,
  news: Newspaper,
  identity: Fingerprint,
  spirituality: Sparkles,
};

export function ImpactIcon({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const Icon = impactIcons[id as ImpactId] ?? Shapes;
  return <Icon aria-hidden="true" className={className} />;
}

export function MoodBadge({
  valence,
  className,
}: {
  valence: number;
  className?: string;
}) {
  return (
    <span className={cn("mood-badge", className)} style={moodStyle(valence)}>
      <MoodShape valence={valence} size={18} />
      {moodLevelLabel(valence)}
    </span>
  );
}

export function ImpactList({
  ids,
  className,
}: {
  ids: readonly string[];
  className?: string;
}) {
  if (!ids.length) return null;
  return (
    <ul
      aria-label="What’s having an impact"
      className={cn("mood-impacts", className)}
    >
      {ids.map((id) => (
        <li key={id}>
          <ImpactIcon id={id} />
          {impactDetails(id)?.label ?? id}
        </li>
      ))}
    </ul>
  );
}
