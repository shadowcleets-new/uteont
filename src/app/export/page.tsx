"use client";

import { useMemo, useState } from "react";
import { DOMAINS, FORMAT_LABELS } from "@/lib/export/registry";
import type { ExportFormat } from "@/lib/export/types";

export default function ExportPage() {
  const implementedDomains = useMemo(() => DOMAINS.filter((d) => d.implemented), []);
  const [domainKey, setDomainKey] = useState<string>(implementedDomains[0]?.key ?? "");
  const domain = DOMAINS.find((d) => d.key === domainKey);

  const allowedFormats = domain?.allowedFormats ?? [];
  const [format, setFormat] = useState<ExportFormat>(allowedFormats[0] ?? "csv");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [statuses, setStatuses] = useState<Set<string>>(new Set());

  // Keep format valid if user changes domain
  function changeDomain(next: string) {
    setDomainKey(next);
    setStatuses(new Set());
    const d = DOMAINS.find((x) => x.key === next);
    if (d && !d.allowedFormats.includes(format)) {
      setFormat(d.allowedFormats[0]);
    }
  }

  function toggleStatus(s: string) {
    setStatuses((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }

  function buildUrl(): string {
    const params = new URLSearchParams({ domain: domainKey, format });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (statuses.size) params.set("status", [...statuses].join(","));
    return `/api/export?${params.toString()}`;
  }

  const disabled = !domain?.implemented;

  return (
    <div className="px-9 py-8 max-w-[820px]">
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-2">
        Export
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-8">
        Pull data out of UTEONT in the format you want. Pick what to export,
        which format, and any filters. Disabled domains will light up once
        their source agent is implemented.
      </p>

      <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-6 space-y-5">
        <Section title="DATA">
          <select
            value={domainKey}
            onChange={(e) => changeDomain(e.target.value)}
            className="w-full rounded-md border border-[#e8e6dc] bg-white px-3 py-2 text-[13px] focus:border-[#d97757] outline-none"
          >
            {DOMAINS.map((d) => (
              <option key={d.key} value={d.key} disabled={!d.implemented}>
                {d.label}
                {d.implemented ? "" : " — coming soon"}
              </option>
            ))}
          </select>
          {domain && (
            <p className="text-[11px] text-[#9a988e] mt-1 font-serif italic">
              {domain.description}
            </p>
          )}
        </Section>

        <Section title="FORMAT">
          <div className="flex flex-wrap gap-2">
            {allowedFormats.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={
                  "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors " +
                  (format === f
                    ? "bg-[#d97757] text-white border-[#d97757]"
                    : "bg-white text-[#141413] border-[#cfccc1] hover:bg-[#faf9f5]")
                }
              >
                {FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
        </Section>

        <Section title="DATE RANGE">
          <div className="flex gap-3 items-center">
            <label className="text-[11px] text-[#6b6a64]">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-[#e8e6dc] bg-white px-3 py-1.5 text-[13px] focus:border-[#d97757] outline-none"
            />
            <label className="text-[11px] text-[#6b6a64]">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-[#e8e6dc] bg-white px-3 py-1.5 text-[13px] focus:border-[#d97757] outline-none"
            />
            <button
              type="button"
              onClick={() => { setFrom(""); setTo(""); }}
              className="text-[11px] text-[#9a988e] underline hover:text-[#6b6a64]"
            >
              clear
            </button>
          </div>
        </Section>

        {domain && domain.statusOptions.length > 0 && (
          <Section title="STATUS">
            <div className="flex flex-wrap gap-2">
              {domain.statusOptions.map((s) => {
                const on = statuses.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStatus(s)}
                    className={
                      "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors " +
                      (on
                        ? "bg-[#e8e6dc] text-[#141413] border-[#cfccc1]"
                        : "bg-white text-[#6b6a64] border-[#e8e6dc] hover:bg-[#faf9f5]")
                    }
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[#9a988e] mt-1 font-serif italic">
              No status selected = all statuses included
            </p>
          </Section>
        )}

        <div className="pt-3 border-t border-[#e8e6dc] flex items-center justify-between gap-3">
          <code className="text-[10px] text-[#9a988e] truncate flex-1">
            {buildUrl()}
          </code>
          <a
            href={disabled ? "#" : buildUrl()}
            download={!disabled}
            onClick={(e) => disabled && e.preventDefault()}
            className={
              "rounded-md px-4 py-2 text-sm font-medium transition-colors " +
              (disabled
                ? "bg-[#f3f1ea] text-[#9a988e] cursor-not-allowed"
                : "bg-[#d97757] text-white hover:bg-[#c66948]")
            }
          >
            {disabled ? "Not available" : "Download"}
          </a>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}
