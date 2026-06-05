"use client";

import { useMemo, useState } from "react";
import type { Keyword } from "@/lib/db/schema";

type SortField = "priority" | "keyword" | "volume" | "comp" | "source" | "status" | "found";
type SortDir = "asc" | "desc";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "researched", label: "Researched" },
  { value: "approved", label: "Approved" },
  { value: "shelved", label: "Shelved" },
  { value: "in-progress", label: "In progress" },
  { value: "published", label: "Published" },
];

const SORT_FIELDS: { value: SortField; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "keyword", label: "Keyword" },
  { value: "volume", label: "Volume" },
  { value: "comp", label: "Competition" },
  { value: "source", label: "Source" },
  { value: "status", label: "Status" },
  { value: "found", label: "Found" },
];

// Sensible default direction when you first sort by a field.
const DEFAULT_DIR: Record<SortField, SortDir> = {
  priority: "asc",
  keyword: "asc",
  volume: "desc",
  comp: "asc",
  source: "asc",
  status: "asc",
  found: "desc",
};

const statusColor = (s: string) =>
  s === "approved" ? "#788c5d" : s === "shelved" ? "#a33b2b" : s === "published" ? "#6a9bcc" : "#6b6a64";

const ms = (d: unknown): number => {
  const t = new Date(d as string).getTime();
  return Number.isFinite(t) ? t : 0;
};

const fmtDate = (d: unknown): string => {
  const t = ms(d);
  return t ? new Date(t).toISOString().slice(0, 10) : "—";
};

/** Sortable table header cell — click to sort, click again to flip direction. */
function SortTh({
  field,
  label,
  extra,
  sortField,
  sortDir,
  onSort,
}: {
  field: SortField;
  label: string;
  extra?: string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      title={`Sort by ${label}`}
      className={`px-3 py-2.5 cursor-pointer select-none hover:text-[#141413] ${active ? "text-[#141413]" : ""} ${extra ?? ""}`}
    >
      {label}
      <span className={active ? "text-[#d97757]" : "opacity-25"}>{active ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕"}</span>
    </th>
  );
}

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
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: Keyword, b: Keyword): number => {
      let r = 0;
      switch (sortField) {
        case "priority": r = a.priorityRank - b.priorityRank; break;
        case "keyword": r = a.keyword.localeCompare(b.keyword); break;
        case "volume": r = a.searchVolumeEstimate - b.searchVolumeEstimate; break;
        case "comp": r = a.competitionScore - b.competitionScore; break;
        case "source": r = (a.source || "").localeCompare(b.source || ""); break;
        case "status": r = a.status.localeCompare(b.status); break;
        case "found": r = ms(a.createdAt) - ms(b.createdAt); break;
      }
      return r * dir || a.id - b.id; // stable tiebreak
    };
    return [...out].sort(cmp);
  }, [rows, text, status, minVol, maxComp, source, sortField, sortDir]);

  // Click a column header: same field → flip direction; new field → its default.
  const sortBy = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir(DEFAULT_DIR[field]);
    }
  };

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
  const filtersOn = text || status || minVol || maxComp || source || sortField !== "priority" || sortDir !== "asc";

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
        <div className="flex items-center">
          <select
            value={sortField}
            onChange={(e) => { const f = e.target.value as SortField; setSortField(f); setSortDir(DEFAULT_DIR[f]); }}
            className={`${inputCls} rounded-r-none border-r-0`}
          >
            {SORT_FIELDS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
          </select>
          <button
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            title={`Direction: ${sortDir === "asc" ? "ascending" : "descending"}`}
            className={`${inputCls} rounded-l-none px-2.5`}
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>
        {filtersOn && (
          <button
            onClick={() => { setText(""); setStatus(""); setMinVol(""); setMaxComp(""); setSource(""); setSortField("priority"); setSortDir("asc"); }}
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
                {([
                  { field: "priority" as const, label: "#", extra: "w-10" },
                  { field: "keyword" as const, label: "KEYWORD" },
                  { field: "volume" as const, label: "VOLUME" },
                  { field: "comp" as const, label: "COMP" },
                  { field: "source" as const, label: "SOURCE" },
                  { field: "status" as const, label: "STATUS" },
                  { field: "found" as const, label: "FOUND" },
                ]).map((h) => (
                  <SortTh key={h.field} field={h.field} label={h.label} extra={h.extra} sortField={sortField} sortDir={sortDir} onSort={sortBy} />
                ))}
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
