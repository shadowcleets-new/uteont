"use client";

import { useState, type FormEvent } from "react";
import { Globe, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScanRecord {
  url: string;
  recordedAt: string;
  runId: number | null;
  note?: string;
}

export function LiveSiteScraper() {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<ScanRecord[]>([]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/competitors/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { runId: number };
      setRecent((rs) => [
        {
          url: url.trim(),
          recordedAt: new Date().toISOString(),
          runId: data.runId,
          note: note.trim() || undefined,
        },
        ...rs.slice(0, 9),
      ]);
      setUrl("");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={handleSubmit}
        className="rounded-[10px] border border-[#e8e6dc] bg-white p-5"
      >
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
          SCAN A COMPETITOR
        </div>
        <div className="flex flex-col md:flex-row gap-2 mb-3">
          <div className="flex-1 flex items-center gap-2 rounded-md border border-[#cfccc1] bg-white px-3 py-2 focus-within:border-[#d97757] focus-within:ring-2 focus-within:ring-[#d97757]/30 transition-colors">
            <Globe className="h-4 w-4 text-[#9a988e]" aria-hidden />
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://competitor.com"
              className="flex-1 border-0 bg-transparent text-[13px] focus:outline-none placeholder:text-[#9a988e]"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !url.trim()}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md bg-[#d97757] text-white px-4 py-2 text-[12px] font-medium",
              "hover:bg-[#c66948] disabled:bg-[#f3f1ea] disabled:text-[#9a988e] disabled:cursor-not-allowed transition-colors",
            )}
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            {submitting ? "Recording…" : "Trigger Site Scan"}
          </button>
        </div>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note — what you want to learn (max 500 chars)"
          maxLength={500}
          className="block w-full rounded-md border border-[#e8e6dc] bg-white px-3 py-2 text-[12px] placeholder:text-[#9a988e] focus:outline-none focus:border-[#d97757] focus:ring-2 focus:ring-[#d97757]/30 transition-colors"
        />
        {error && (
          <div className="mt-3 text-[12px] text-[#a33b2b] font-mono">
            {error}
          </div>
        )}
        <p className="mt-3 text-[11px] text-[#9a988e] font-serif italic">
          Each request is logged as an infra run. Real crawling lands when
          the Competitor Audit Agent ships on the worker.
        </p>
      </form>

      <div className="rounded-[10px] border border-[#e8e6dc] bg-white">
        <div className="px-5 py-3 border-b border-[#e8e6dc] flex items-center justify-between">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">
            RECENT REQUESTS
          </div>
          <div className="text-[11px] text-[#6b6a64] tabular-nums">
            {recent.length}
          </div>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-6 text-[12px] text-[#9a988e] italic font-serif">
            No scans yet — trigger one above.
          </div>
        ) : (
          <ul className="divide-y divide-[#f3f1ea] text-[12px]">
            {recent.map((r) => (
              <li key={`${r.runId}-${r.recordedAt}`} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3 mb-0.5">
                  <span className="font-mono text-[#141413] truncate">
                    {r.url}
                  </span>
                  {r.runId && (
                    <span className="text-[10px] text-[#9a988e] tabular-nums">
                      run #{r.runId}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#6b6a64]">
                  {new Date(r.recordedAt).toLocaleString()}
                  {r.note && <> · {r.note}</>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
