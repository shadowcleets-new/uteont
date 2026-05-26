"use client";

import { useState } from "react";
import { findDomain, FORMAT_LABELS } from "@/lib/export/registry";
import type { ExportDomain, ExportFormat } from "@/lib/export/types";

interface ExportButtonProps {
  domain: ExportDomain;
  className?: string;
}

/**
 * Quick-export dropdown. Renders disabled if the domain isn't implemented.
 * Click format → triggers a download via /api/export with no filters.
 */
export function ExportButton({ domain, className = "" }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const spec = findDomain(domain);
  const disabled = !spec || !spec.implemented;

  const url = (format: ExportFormat): string =>
    `/api/export?domain=${encodeURIComponent(domain)}&format=${encodeURIComponent(format)}`;

  return (
    <div className={"relative inline-block " + className}>
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
        Export ▾
      </button>

      {open && !disabled && spec && (
        <div className="absolute right-0 top-full mt-1 z-10 min-w-[180px] rounded-md border border-[#e8e6dc] bg-white shadow-md py-1">
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
