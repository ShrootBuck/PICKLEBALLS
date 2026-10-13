"use client";
import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSocial } from "@/components/social/social-provider";
import { Button } from "@/components/ui/button";

// Opened from a link or notification, there is no in-app page to return to.
function parentPath(pathname: string) {
  const section = pathname.split("/")[1];
  if (section === "posts") return "/feed";
  return section ? `/${section}` : "/";
}

export function BackButton() {
  const router = useRouter();
  const { scrolls } = useSocial();
  const pathname = usePathname();
  const routeKey = `${pathname}?${useSearchParams().toString()}`;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 self-start"
      onClick={() =>
        [...scrolls.keys()].some((key) => key !== routeKey)
          ? router.back()
          : router.push(parentPath(pathname))
      }
    >
      <ArrowLeft data-icon="inline-start" /> Back
    </Button>
  );
}
