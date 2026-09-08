"use client";
import { useEffect, useState } from "react";
import { formatReplyTime } from "@/lib/time";

export function PostTimestamp({ dateTime }: { dateTime: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const minutes =
    now === null
      ? null
      : Math.max(0, Math.floor((now - new Date(dateTime).getTime()) / 60_000));
  const full = formatReplyTime(dateTime);
  const label =
    minutes === null
      ? full
      : minutes < 1
        ? "Just now"
        : minutes < 60
          ? `${minutes}m ago`
          : minutes < 1440
            ? `${Math.floor(minutes / 60)}h ago`
            : minutes < 10080
              ? `${Math.floor(minutes / 1440)}d ago`
              : full;
  return (
    <time dateTime={dateTime} title={full}>
      {label}
    </time>
  );
}
