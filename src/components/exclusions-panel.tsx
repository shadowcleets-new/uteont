"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ExclusionRow {
  id: number;
  phrase: string;
  reason: string | null;
  source: string;
  createdAt: string | null;
}

interface ExclusionsPanelProps {
  siteId: number;
  initial: ExclusionRow[];
}

export function ExclusionsPanel({ siteId, initial }: ExclusionsPanelProps) {
  const [rows, setRows] = useState<ExclusionRow[]>(initial);
  const [phrase, setPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!phrase.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/exclusions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phrase: phrase.trim(),
          reason: reason.trim() || undefined,
          source: "manual",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const row = (await res.json()) as ExclusionRow;
      setRows((prev) =>
        prev.some((r) => r.id === row.id) ? prev : [row, ...prev],
      );
      setPhrase("");
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: number) {
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/sites/${siteId}/exclusions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      setRows(prev);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
          ADD AN EXCLUSION
        </div>
        <div className="flex flex-col md:flex-row gap-2 mb-2">
          <input
            type="text"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="phrase to block (e.g. credit card rewards)"
            className="flex-1 rounded-md border border-[#cfccc1] bg-white px-3 py-2 text-[12px] focus:outline-none focus:border-[#d97757] focus:ring-2 focus:ring-[#d97757]/30"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="optional reason"
            maxLength={200}
            className="flex-1 rounded-md border border-[#cfccc1] bg-white px-3 py-2 text-[12px] focus:outline-none focus:border-[#d97757] focus:ring-2 focus:ring-[#d97757]/30"
          />
          <button
            type="button"
            onClick={add}
            disabled={submitting || !phrase.trim()}
            className={cn(
              "inline-flex items-center gap-1 rounded-md bg-[#d97757] text-white px-3 py-2 text-[12px] font-medium",
              "hover:bg-[#c66948] disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
            )}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add
          </button>
        </div>
        {error && (
          <div className="text-[12px] text-[#a33b2b] font-mono">{error}</div>
        )}
        <p className="text-[11px] text-[#9a988e] font-serif italic">
          Captures also happen automatically when you shelve a keyword —
          and restoring it lifts the exclusion again. The next Research and
          Ideation runs receive this list as a negative constraint, and
          incoming keywords are filtered against it on arrival.
        </p>
      </div>

      <div className="rounded-[10px] border border-[#e8e6dc] bg-white">
        <div className="px-5 py-3 border-b border-[#e8e6dc] flex items-center justify-between">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">
            ACTIVE EXCLUSIONS
          </div>
          <div className="text-[11px] text-[#6b6a64] tabular-nums">
            {rows.length}
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-6 text-[12px] text-[#9a988e] italic font-serif">
            No exclusions yet. Shelve keywords elsewhere or add one above.
          </div>
        ) : (
          <ul className="divide-y divide-[#f3f1ea]">
            {rows.map((r) => (
              <li
                key={r.id}
                className="px-5 py-3 flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[#141413] truncate">
                    {r.phrase}
                  </div>
                  <div className="text-[11px] text-[#6b6a64] mt-0.5">
                    via <span className="uppercase">{r.source}</span>
                    {r.reason && <> · {r.reason}</>}
                    {r.createdAt && (
                      <>
                        {" · "}
                        <time>{new Date(r.createdAt).toLocaleDateString()}</time>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  aria-label={`Remove "${r.phrase}"`}
                  className="rounded-md p-1 text-[#9a988e] hover:bg-[#fef3eb] hover:text-[#a33b2b] transition-colors"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
