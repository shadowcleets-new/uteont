"use client";

import { useMemo, useState } from "react";
import type { Keyword } from "@/lib/db/schema";

type SortKey = "priority" | "volume-desc" | "volume-asc" | "comp-asc" | "comp-desc" | "recent";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "researched", label: "Researched" },
  { value: "approved", label: "Approved" },
  { value: "shelved", label: "Shelved" },
  { value: "in-progress", label: "In progress" },
  { value: "published", label: "Published" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "priority", label: "Sort: Priority" },
  { value: "volume-desc", label: "Sort: Volume ↓" },
  { value: "volume-asc", label: "Sort: Volume ↑" },
  { value: "comp-asc", label: "Sort: Easiest (comp ↑)" },
  { value: "comp-desc", label: "Sort: Hardest (comp ↓)" },
  { value: "recent", label: "Sort: Newest" },
];

const statusColor = (s: string) =>
  s === "approved" ? "#788c5d" : s === "shelved" ? "#a33b2b" : s === "published" ? "#6a9bcc" : "#6b6a64";

const fmtDate = (d: unknown): string => {
  const t = new Date(d as string).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "—";
};

export function KeywordsManager({ initial }: { initial: Keyword[] }) {
  const [rows, setRows] = useState<Keyword[]>(initial);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Advanced filters.
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [minVol, setMinVol] = useState("");
  const [maxComp, setMaxComp] = useState(""); // 0-100 (%)
  const [source, setSource] = useState("");
  const [sort, setSort] = useState<SortKey>("priority");

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const k of rows) {
      const s = (k.source || "").split(/[+,]/)[0]?.trim();
      if (s) set.add(s);
    }
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const t = text.trim().toLowerCase();
    const minV = minVol.trim() ? Number(minVol) : null;
    const maxC = maxComp.trim() ? Number(maxComp) / 100 : null;
    const src = source.trim().toLowerCase();
    const out = rows.filter((k) => {
      if (t && !k.keyword.toLowerCase().includes(t)) return false;
      if (status && k.status !== status) return false;
      if (minV != null && k.searchVolumeEstimate < minV) return false;
      if (maxC != null && k.competitionScore > maxC) return false;
      if (src && !(k.source || "").toLowerCase().includes(src)) return false;
      return true;
    });
    const cmp: Record<SortKey, (a: Keyword, b: Keyword) => number> = {
      priority: (a, b) => a.priorityRank - b.priorityRank,
      "volume-desc": (a, b) => b.searchVolumeEstimate - a.searchVolumeEstimate,
      "volume-asc": (a, b) => a.searchVolumeEstimate - b.searchVolumeEstimate,
      "comp-asc": (a, b) => a.competitionScore - b.competitionScore,
      "comp-desc": (a, b) => b.competitionScore - a.competitionScore,
      recent: (a, b) => b.id - a.id,
    };
    return [...out].sort(cmp[sort]);
  }, [rows, text, status, minVol, maxComp, source, sort]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((k) => selected.has(k.id));

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (filtered.every((k) => next.has(k.id))) filtered.forEach((k) => next.delete(k.id));
      else filtered.forEach((k) => next.add(k.id));
      return next;
    });

  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const applyLocal = (ids: number[], to: string, reason: string | null) => {
    const idSet = new Set(ids);
    setRows((l) =>
      l.map((k) =>
        idSet.has(k.id)
          ? ({ ...k, status: to, shelvedReason: to === "shelved" ? reason : null } as Keyword)
          : k,
      ),
    );
  };

  const bulk = async (to: string) => {
    const ids = [...selected];
    if (!ids.length) return;
    const reason = to === "shelved" ? window.prompt(`Reason for shelving ${ids.length} keyword(s) (optional)`) || null : null;
    setPending(true);
    setError(null);
    applyLocal(ids, to, reason); // optimistic
    try {
      const res = await fetch("/api/keywords/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status: to, shelvedReason: reason ?? undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelected(new Set());
    } catch (e) {
      setError(`Bulk update failed (${String(e)}). Refresh to re-sync.`);
    } finally {
      setPending(false);
    }
  };

  const single = async (id: number, to: string) => {
    const reason = to === "shelved" ? window.prompt("Reason for shelving (optional)") || null : null;
    setError(null);
    applyLocal([id], to, reason); // optimistic
    try {
      const res = await fetch(`/api/keywords/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to, shelvedReason: to === "shelved" ? reason ?? undefined : null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setError(`Update failed (${String(e)}).`);
    }
  };

  const inputCls = "rounded border border-[#cfccc1] bg-white px-2 py-1 text-[12px] focus:outline-none focus:border-[#d97757]";
  const filtersOn = text || status || minVol || maxComp || source || sort !== "priority";

  return (
    <div>
      {/* Advanced filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search keyword…" className={`${inputCls} w-44`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input value={minVol} onChange={(e) => setMinVol(e.target.value)} placeholder="Min vol" type="number" className={`${inputCls} w-24`} />
        <input value={maxComp} onChange={(e) => setMaxComp(e.target.value)} placeholder="Max comp %" type="number" className={`${inputCls} w-28`} />
        <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
          <option value="">All sources</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={inputCls}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {filtersOn && (
          <button
            onClick={() => { setText(""); setStatus(""); setMinVol(""); setMaxComp(""); setSource(""); setSort("priority"); }}
            className="text-[11px] text-[#9a988e] hover:text-[#141413] underline"
          >
            Reset
          </button>
        )}
        <span className="text-[11px] text-[#9a988e] ml-auto tabular-nums">{filtered.length} / {rows.length}</span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-4 mb-3 rounded-[8px] bg-[#faf5ee] border border-[#e8d9c5] px-3 py-2 text-[12px]">
          <span className="font-medium text-[#141413]">{selected.size} selected</span>
          <button disabled={pending} onClick={() => bulk("approved")} className="text-[#4a6b2f] font-medium hover:underline disabled:opacity-50">Approve</button>
          <button disabled={pending} onClick={() => bulk("shelved")} className="text-[#a33b2b] hover:underline disabled:opacity-50">Shelve</button>
          <button disabled={pending} onClick={() => bulk("researched")} className="text-[#6a9bcc] hover:underline disabled:opacity-50">Restore</button>
          <button onClick={() => setSelected(new Set())} className="text-[#9a988e] hover:text-[#141413] ml-auto">Clear</button>
        </div>
      )}
      {error && <div className="text-[11px] text-[#a33b2b] mb-2">{error}</div>}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
          <p className="text-[12px] text-[#9a988e] italic font-serif">No keywords match the filters.</p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[#faf9f5]">
              <tr className="text-[10px] font-bold tracking-wider text-[#9a988e] text-left">
                <th className="px-3 py-2.5 w-8"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all" /></th>
                <th className="px-3 py-2.5 w-10">#</th>
                <th className="px-3 py-2.5">KEYWORD</th>
                <th className="px-3 py-2.5">VOLUME</th>
                <th className="px-3 py-2.5">COMP</th>
                <th className="px-3 py-2.5">SOURCE</th>
                <th className="px-3 py-2.5">STATUS</th>
                <th className="px-3 py-2.5">FOUND</th>
                <th className="px-3 py-2.5 w-28">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((k) => (
                <tr key={k.id} className={`border-t border-[#f3f1ea] ${selected.has(k.id) ? "bg-[#fbf6ef]" : ""}`}>
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.has(k.id)} onChange={() => toggleOne(k.id)} aria-label={`Select ${k.keyword}`} /></td>
                  <td className="px-3 py-2 text-[#9a988e] tabular-nums">{k.priorityRank}</td>
                  <td className="px-3 py-2 text-[#141413] font-medium">{k.keyword}</td>
                  <td className="px-3 py-2 text-[#6b6a64] tabular-nums">{k.searchVolumeEstimate.toLocaleString()}</td>
                  <td className="px-3 py-2 text-[#6b6a64] tabular-nums">{Math.round(k.competitionScore * 100)}%</td>
                  <td className="px-3 py-2 text-[#9a988e] text-[11px]">{(k.source || "").slice(0, 24)}</td>
                  <td className="px-3 py-2"><span style={{ color: statusColor(k.status) }} className="font-medium">{k.status}</span></td>
                  <td className="px-3 py-2 text-[#9a988e] text-[11px]">{fmtDate(k.createdAt)}</td>
                  <td className="px-3 py-2">
                    {k.status === "approved" ? (
                      <button onClick={() => single(k.id, "researched")} className="text-[11px] text-[#6a9bcc] hover:underline">Unapprove</button>
                    ) : k.status === "shelved" ? (
                      <button onClick={() => single(k.id, "researched")} className="text-[11px] text-[#6a9bcc] hover:underline">Restore</button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => single(k.id, "approved")} className="text-[11px] text-[#788c5d] font-medium hover:underline">Approve</button>
                        <button onClick={() => single(k.id, "shelved")} className="text-[11px] text-[#a33b2b] hover:underline">Shelve</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
