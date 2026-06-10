"use client";

import { useMemo, useState } from "react";
import { Download, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CompetitorRow {
  id: string;
  domain: string;
  /** Site Crawl agent score (0–100) from the latest scan. */
  score: number;
  /** Top failing checks from the crawl. */
  keyIssues: string[];
  /** Sample thin/orphan pages worth attacking. */
  weakPages: string[];
  lastScanned: string | null;
}

interface CompetitorDirectoryProps {
  competitors: CompetitorRow[];
}

function downloadFile(name: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toCSV(rows: CompetitorRow[]): string {
  const esc = (s: string) =>
    /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const header = ["id", "domain", "score", "keyIssues", "weakPages", "lastScanned"].join(",");
  const body = rows.map((r) =>
    [
      esc(r.id),
      esc(r.domain),
      String(r.score),
      esc(r.keyIssues.join(";")),
      esc(r.weakPages.join(";")),
      esc(r.lastScanned ?? ""),
    ].join(","),
  );
  return [header, ...body].join("\n");
}

export function CompetitorDirectory({ competitors }: CompetitorDirectoryProps) {
  const [scoreFilter, setScoreFilter] = useState<"all" | "high" | "mid" | "low">("all");

  const filtered = useMemo(() => {
    if (scoreFilter === "all") return competitors;
    return competitors.filter((c) => {
      if (scoreFilter === "high") return c.score >= 70;
      if (scoreFilter === "mid") return c.score >= 40 && c.score < 70;
      return c.score < 40;
    });
  }, [scoreFilter, competitors]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px]">
          {(
            [
              { key: "all" as const, label: "All" },
              { key: "high" as const, label: "Score 70+" },
              { key: "mid" as const, label: "Score 40–69" },
              { key: "low" as const, label: "Score <40" },
            ] satisfies Array<{ key: "all" | "high" | "mid" | "low"; label: string }>
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setScoreFilter(opt.key)}
              className={cn(
                "rounded-full border px-2.5 py-1 transition-colors",
                scoreFilter === opt.key
                  ? "border-[#d97757] bg-[#fef3eb] text-[#a33b2b]"
                  : "border-[#e8e6dc] bg-white text-[#6b6a64] hover:border-[#cfccc1]",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadFile("competitors.csv", "text/csv;charset=utf-8", toCSV(filtered))}
            className="inline-flex items-center gap-1 rounded-md border border-[#cfccc1] bg-white px-2.5 py-1 text-[11px] text-[#141413] hover:border-[#d97757] transition-colors"
          >
            <Download className="h-3 w-3" aria-hidden /> CSV
          </button>
          <button
            type="button"
            onClick={() =>
              downloadFile("competitors.json", "application/json", JSON.stringify(filtered, null, 2))
            }
            className="inline-flex items-center gap-1 rounded-md border border-[#cfccc1] bg-white px-2.5 py-1 text-[11px] text-[#141413] hover:border-[#d97757] transition-colors"
          >
            <Download className="h-3 w-3" aria-hidden /> JSON
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[#cfccc1] bg-white px-6 py-12 text-center">
          <Trophy aria-hidden className="mx-auto h-8 w-8 text-[#cfccc1] mb-3" />
          <p className="text-[13px] text-[#6b6a64] font-serif italic">
            No competitors in the directory yet. Run a scan on the Live Site
            Scraper tab — every successful crawl lands here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <article key={c.id} className="rounded-[10px] border border-[#e8e6dc] bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="text-[13px] font-semibold text-[#141413] truncate">{c.domain}</div>
                <span
                  className="text-[10px] font-bold tabular-nums"
                  style={{ color: c.score >= 70 ? "#788c5d" : c.score >= 40 ? "#d97757" : "#a33b2b" }}
                >
                  CRAWL {c.score}
                </span>
              </div>
              <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1">KEY ISSUES</div>
              {c.keyIssues.length === 0 ? (
                <p className="text-[12px] text-[#788c5d] font-serif mb-2">No failing checks — strong site.</p>
              ) : (
                <ul className="text-[12px] text-[#d97757] mb-2 list-disc list-inside [&_li]:font-serif">
                  {c.keyIssues.slice(0, 3).map((k) => (
                    <li key={k} className="truncate">{k}</li>
                  ))}
                </ul>
              )}
              <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1">
                WEAK PAGES (THIN / ORPHAN)
              </div>
              {c.weakPages.length === 0 ? (
                <p className="text-[12px] text-[#6b6a64] font-serif">None surfaced by the crawl.</p>
              ) : (
                <ul className="text-[12px] text-[#6b6a64] list-disc list-inside [&_li]:font-mono">
                  {c.weakPages.slice(0, 3).map((g) => (
                    <li key={g} className="truncate">{g}</li>
                  ))}
                </ul>
              )}
              {c.lastScanned && (
                <div className="mt-2 text-[10px] text-[#9a988e] italic">
                  scanned {new Date(c.lastScanned).toLocaleDateString()}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
