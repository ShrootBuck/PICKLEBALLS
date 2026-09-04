import { Camera, Gavel, Lock } from "lucide-react";
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const steps = [
  {
    icon: Lock,
    title: "Lock a promise",
    body: "Name real work with a finish line. Due at midnight, no extensions.",
  },
  {
    icon: Camera,
    title: "Post photo proof",
    body: "Photo or it did not happen. Blurry pics get challenged.",
  },
  {
    icon: Gavel,
    title: "Friends decide",
    body: "One approval verifies it. One challenge sends it back.",
  },
];

export function OnboardingCard({ action }: { action: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-lg tracking-tight">How this works</CardTitle>
        <CardDescription>
          A blank board is just procrastination with extra steps.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ol className="flex flex-col gap-2.5">
          {steps.map((step) => (
            <li key={step.title} className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <step.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {step.title}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {step.body}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <div className="[&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto">
          {action}
        </div>
      </CardContent>
    </Card>
  );
}
