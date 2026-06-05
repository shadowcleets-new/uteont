"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Pause, Play } from "lucide-react";
import { useLocalStorage } from "@/lib/hooks/use-local-storage";
import { cn } from "@/lib/utils";

interface RunRow {
  id: number;
  subjectKey: string;
  action: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

const POLL_MS = 4000;
const PAGE_SIZE = 25;

function fmtTime(iso: string | null): string {
  if (!iso) return "--:--:--";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--:--:--";
  }
}

function lineColor(status: string): string {
  switch (status) {
    case "success":
      return "text-emerald-400";
    case "failure":
      return "text-red-400";
    case "running":
      return "text-amber-300";
    default:
      return "text-emerald-400/80";
  }
}

export function LiveAgentConsole() {
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(
    "ui.agentConsoleCollapsed",
    false,
  );
  const [paused, setPaused] = useState(false);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    if (collapsed || paused) return;
    let alive = true;

    async function tick() {
      try {
        const res = await fetch(`/api/runs?limit=${PAGE_SIZE}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { runs?: RunRow[]; error?: string };
        if (!alive) return;
        if (json.error) {
          setError(json.error);
          return;
        }
        setError(null);
        setRows((json.runs ?? []).slice().reverse());
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    }

    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [collapsed, paused]);

  // Track whether the user wants auto-stick. They lose the stick if they
  // scroll up; they regain it the moment they scroll back to the bottom.
  useEffect(() => {
    if (!stickRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [rows]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const dist = el.scrollHeight - el.clientHeight - el.scrollTop;
    stickRef.current = dist < 24;
  }

  return (
    <section className="rounded-[10px] border border-[#e8e6dc] bg-slate-950 text-emerald-400 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80 bg-slate-900">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              paused ? "bg-amber-400" : "bg-emerald-400 animate-pulse",
            )}
          />
          <span className="text-[10px] font-bold tracking-wider text-slate-300">
            LIVE AGENT CONSOLE
          </span>
          {error && (
            <span className="text-[10px] text-red-400 font-mono">
              · {error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            disabled={collapsed}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-mono",
              "bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40",
              "transition-colors",
            )}
            aria-label={paused ? "Resume stream" : "Pause stream"}
          >
            {paused ? (
              <>
                <Play className="h-3 w-3" aria-hidden /> Resume
              </>
            ) : (
              <>
                <Pause className="h-3 w-3" aria-hidden /> Pause
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-mono bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
            aria-label={collapsed ? "Expand console" : "Collapse console"}
          >
            {collapsed ? (
              <>
                <ChevronUp className="h-3 w-3" aria-hidden /> Expand
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" aria-hidden /> Collapse
              </>
            )}
          </button>
        </div>
      </header>
      {!collapsed && (
        <div
          ref={containerRef}
          onScroll={onScroll}
          className="font-mono text-xs p-4 max-h-[240px] overflow-y-auto"
        >
          {rows.length === 0 && !error && (
            <p className="text-slate-500 italic">
              Waiting for agent activity…
            </p>
          )}
          {rows.map((r) => {
            const tone = lineColor(r.status);
            const ended = r.finishedAt ?? r.startedAt;
            return (
              <div key={r.id} className="leading-5">
                <span className="text-slate-500">[{fmtTime(ended)}]</span>{" "}
                <span className="text-slate-300">#{r.id}</span>{" "}
                <span className="text-cyan-300">{r.subjectKey}</span>{" "}
                <span className="text-slate-400">{r.action}</span>{" "}
                <span className={tone}>{r.status}</span>
                {r.error && (
                  <span className="text-red-400/80"> · {r.error}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
