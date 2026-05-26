"use client";

import { useEffect, useRef, useState } from "react";
import { findDomain, FORMAT_LABELS } from "@/lib/export/registry";
import type { ExportDomain, ExportFormat } from "@/lib/export/types";

interface ExportButtonProps {
  domain: ExportDomain;
  /** Optional filter — e.g. `agent.research` to scope a runs export to one agent. */
  subject?: string;
  /** Override the visible label. Defaults to "Export". */
  label?: string;
  className?: string;
}

/**
 * Quick-export dropdown. Renders disabled if the domain isn't implemented.
 * Click format → triggers a download via /api/export with the given filters.
 */
export function ExportButton({
  domain,
  subject,
  label = "Export",
  className = "",
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const spec = findDomain(domain);
  const disabled = !spec || !spec.implemented;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const url = (format: ExportFormat): string => {
    const params = new URLSearchParams({ domain, format });
    if (subject) params.set("subject", subject);
    return `/api/export?${params.toString()}`;
  };

  return (
    <div ref={ref} className={"relative inline-block " + className}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={
          "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors " +
          (disabled
            ? "bg-[#f3f1ea] text-[#9a988e] border-[#e8e6dc] cursor-not-allowed"
            : "bg-white text-[#141413] border-[#cfccc1] hover:bg-[#faf9f5]")
        }
        title={disabled ? "Not available yet" : "Quick export"}
      >
        {label} ▾
      </button>

      {open && !disabled && spec && (
        <div className="absolute right-0 top-full mt-1 z-10 min-w-[200px] rounded-md border border-[#e8e6dc] bg-white shadow-lg py-1">
          <div className="px-4 py-1.5 text-[10px] font-bold tracking-wider text-[#9a988e] border-b border-[#e8e6dc]">
            DOWNLOAD AS
          </div>
          {spec.allowedFormats.map((f) => (
            <a
              key={f}
              href={url(f)}
              download
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-[12px] text-[#141413] hover:bg-[#faf9f5]"
            >
              {FORMAT_LABELS[f]}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
