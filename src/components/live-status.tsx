"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * #4 Live run states. While any agent is running, quietly re-fetches the
 * server component on an interval so run status (running -> success/failure)
 * updates without a manual refresh. Renders a small pulsing "live" indicator;
 * renders nothing when idle.
 */
export function LiveStatus({
  runningCount,
  intervalMs = 5000,
}: {
  runningCount: number;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (runningCount <= 0) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [runningCount, intervalMs, router]);

  if (runningCount <= 0) return null;

  return (
    <div className="flex items-center gap-2 text-[12px] text-[#6b6a64]">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#788c5d] opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#788c5d]" />
      </span>
      {runningCount} agent{runningCount > 1 ? "s" : ""} running · live
    </div>
  );
}
