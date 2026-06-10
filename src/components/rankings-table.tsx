"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RankingRow } from "@/lib/analytics/synth";

interface RankingsTableProps {
  rows: RankingRow[];
}

type SortKey = "position" | "ctr" | "impressions" | "keyword";
type PositionBucket = "all" | "top3" | "top10" | "page2+";

const COLS: Array<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "keyword", label: "KEYWORD" },
  { key: "position", label: "POSITION", align: "right" },
  { key: "ctr", label: "CTR", align: "right" },
  { key: "impressions", label: "IMPRESSIONS", align: "right" },
];

const BUCKETS: Array<{ key: PositionBucket; label: string }> = [
  { key: "all", label: "All" },
  { key: "top3", label: "Top 3" },
  { key: "top10", label: "Top 10" },
  { key: "page2+", label: "Page 2+" },
];

function inBucket(pos: number, b: PositionBucket): boolean {
  if (b === "all") return true;
  if (b === "top3") return pos < 3.5;
  if (b === "top10") return pos < 10.5;
  return pos >= 10.5;
}

function impactClass(impact: RankingRow["revenueImpact"]): string {
  if (impact === "high") return "bg-[#fef3eb] text-[#a33b2b] border border-[#d97757]/40";
  if (impact === "medium") return "bg-[#f3f1ea] text-[#6b6a64] border border-[#e8e6dc]";
  return "bg-white text-[#9a988e] border border-[#e8e6dc]";
}

export function RankingsTable({ rows }: RankingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [bucket, setBucket] = useState<PositionBucket>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = rows.filter((r) => inBucket(r.position, bucket));
    if (!q) return base;
    return base.filter((r) => r.keyword.toLowerCase().includes(q));
  }, [rows, bucket, query]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "keyword") return a.keyword.localeCompare(b.keyword) * dir;
      return (a[sortKey] - b[sortKey]) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "keyword" ? "asc" : "asc");
    }
  }

  return (
    <div className="rounded-[10px] border border-[#e8e6dc] bg-white">
      <div className="px-5 py-3 border-b border-[#e8e6dc] flex flex-col md:flex-row md:items-center gap-3">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] flex-1">
          KEYWORD RANKINGS
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter keywords…"
          className="rounded-md border border-[#cfccc1] bg-white px-2.5 py-1 text-[12px] focus:outline-none focus:border-[#d97757] w-full md:w-[200px]"
        />
        <div className="flex items-center gap-1 text-[11px]">
          {BUCKETS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBucket(b.key)}
              className={cn(
                "rounded-full border px-2.5 py-1 transition-colors",
                bucket === b.key
                  ? "border-[#d97757] bg-[#fef3eb] text-[#a33b2b]"
                  : "border-[#e8e6dc] bg-white text-[#6b6a64] hover:border-[#cfccc1]",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <table className="w-full text-[12px]">
        <thead className="bg-[#faf9f5] text-[10px] font-bold tracking-wider text-[#9a988e]">
          <tr>
            {COLS.map((c) => {
              const active = sortKey === c.key;
              return (
                <th
                  key={c.key}
                  className={cn(
                    "px-4 py-2.5 whitespace-nowrap select-none",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className={cn(
                      "inline-flex items-center gap-1",
                      c.align === "right" && "flex-row-reverse",
                      active ? "text-[#141413]" : "hover:text-[#141413]",
                    )}
                  >
                    {c.label}
                    {active &&
                      (sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3" aria-hidden />
                      ) : (
                        <ArrowDown className="h-3 w-3" aria-hidden />
                      ))}
                  </button>
                </th>
              );
            })}
            <th className="px-4 py-2.5 text-right text-[10px] font-bold tracking-wider text-[#9a988e]">
              REVENUE IMPACT
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={COLS.length + 1}
                className="px-4 py-6 text-center text-[12px] text-[#9a988e] italic font-serif"
              >
                No keywords match this filter.
              </td>
            </tr>
          ) : (
            sorted.map((r) => (
              <tr key={r.keyword} className="border-t border-[#f3f1ea]">
                <td className="px-4 py-2 font-mono text-[11px] text-[#141413]">
                  {r.keyword}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-[#141413]">
                  {r.position.toFixed(1)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-[#6b6a64]">
                  {(r.ctr * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-[#6b6a64]">
                  {r.impressions.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase",
                      impactClass(r.revenueImpact),
                    )}
                  >
                    {r.revenueImpact}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
