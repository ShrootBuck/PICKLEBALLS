"use client";
import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSocial } from "@/components/social/social-provider";
import { Button } from "@/components/ui/button";
export function BackButton() {
  const router = useRouter();
  const { scrolls } = useSocial();
  const routeKey = `${usePathname()}?${useSearchParams().toString()}`;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 self-start"
      onClick={() =>
        [...scrolls.keys()].some((key) => key !== routeKey)
          ? router.back()
          : router.push("/")
      }
    >
      <ArrowLeft data-icon="inline-start" /> Back
    </Button>
  );
}
