"use client";

import { useState, useRef, useEffect, useId, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  /** Body rendered inside the popover. Plain text or rich JSX. */
  children: ReactNode;
  /** Optional override for the trigger glyph. */
  triggerLabel?: string;
  className?: string;
}

/**
 * A minimal hover + focus info tooltip with no third-party dep. Designed
 * for inline help next to form inputs. Visible on hover, focus, or tap
 * (treats first click as toggle). Closes on outside-click + Escape.
 */
export function InfoTooltip({
  children,
  triggerLabel = "More info",
  className,
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={triggerLabel}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[#9a988e] hover:text-[#6b6a64] focus-visible:text-[#141413] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d97757]"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2",
            "min-w-[240px] max-w-[320px] rounded-md border border-[#e8e6dc] bg-white px-3 py-2",
            "text-[12px] leading-snug text-[#141413] shadow-lg shadow-[#14141308]",
          )}
        >
          <span
            aria-hidden
            className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 border-l border-t border-[#e8e6dc] bg-white"
          />
          {children}
        </span>
      )}
    </span>
  );
}
