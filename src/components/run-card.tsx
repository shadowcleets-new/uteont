"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Clipboard,
  ClipboardCheck,
  CircleAlert,
  CircleCheck,
  Clock,
  Coins,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Run } from "@/lib/db/schema";

interface RunCardProps {
  run: Run;
}

function durationSeconds(run: Run): number | null {
  if (!run.startedAt) return null;
  const start = new Date(run.startedAt as unknown as string).getTime();
  const end = run.finishedAt
    ? new Date(run.finishedAt as unknown as string).getTime()
    : Date.now();
  return Math.max(0, (end - start) / 1000);
}

function fmtSeconds(s: number | null): string {
  if (s == null) return "—";
  if (s < 1) return `${Math.round(s * 1000)}ms`;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}m ${Math.round(r)}s`;
}

interface ResultSummary {
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  substeps?: Array<{ name: string; ms?: number; status?: string; error?: string }>;
}

function parseResult(raw: unknown): ResultSummary | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as ResultSummary;
}

function statusColor(status: string): string {
  if (status === "success") return "#788c5d";
  if (status === "failure") return "#a33b2b";
  if (status === "running") return "#d97757";
  return "#9a988e";
}

function troubleshootingHint(error: string | null): string | null {
  if (!error) return null;
  const lower = error.toLowerCase();
  if (lower.includes("rate limit")) {
    return "Rate limit reached. Automatic queue retry in 60s — confirm rate-limit budget in Settings.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "Step exceeded the configured timeout. Increase the budget or split the prompt.";
  }
  if (lower.includes("unauthorized") || lower.includes("401")) {
    return "Auth failed for an upstream API — re-verify the relevant integration.";
  }
  if (lower.includes("database") || lower.includes("connection")) {
    return "Database link dropped mid-run. Check Neon status and the /api/db-status endpoint.";
  }
  return "Inspect the run's result payload below for the failing step's context.";
}

export function RunCard({ run }: RunCardProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dur = durationSeconds(run);
  const result = parseResult(run.result);
  const substeps = result?.substeps ?? [];
  const tokensIn = result?.tokensIn;
  const tokensOut = result?.tokensOut;
  const cost = result?.costUsd;
  const tone = statusColor(run.status);
  const hint = troubleshootingHint(run.error);

  async function copyStack() {
    if (!run.error) return;
    try {
      await navigator.clipboard.writeText(run.error);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — fall back silently
    }
  }

  return (
    <article className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full grid grid-cols-12 gap-3 items-center px-4 py-3 hover:bg-[#faf9f5] transition-colors text-left"
      >
        <div className="col-span-1 flex items-center gap-1.5">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-[#9a988e]" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[#9a988e]" aria-hidden />
          )}
          <span className="text-[10px] text-[#9a988e] tabular-nums">#{run.id}</span>
        </div>
        <div className="col-span-4 text-[12px] text-[#141413] font-mono truncate">
          {run.subjectKey}
        </div>
        <div className="col-span-3 text-[12px] text-[#6b6a64] truncate">
          {run.action}
        </div>
        <div className="col-span-2 flex items-center gap-1 text-[11px]" style={{ color: tone }}>
          {run.status === "success" ? (
            <CircleCheck className="h-3 w-3" aria-hidden />
          ) : run.status === "failure" ? (
            <CircleAlert className="h-3 w-3" aria-hidden />
          ) : (
            <Clock className="h-3 w-3 animate-pulse" aria-hidden />
          )}
          <span className="font-medium">{run.status}</span>
        </div>
        <div className="col-span-2 text-right text-[11px] text-[#6b6a64] tabular-nums">
          {fmtSeconds(dur)}
        </div>
      </button>

      {open && (
        <div className="border-t border-[#e8e6dc] bg-[#faf9f5] px-5 py-4">
          <div className="mb-3">
            <Link
              href={`/runs?subject=${encodeURIComponent(run.subjectKey)}`}
              className="inline-flex items-center gap-1 text-[11px] text-[#6b6a64] hover:text-[#d97757] underline decoration-[#cfccc1] hover:decoration-[#d97757] transition-colors"
            >
              <Filter className="h-3 w-3" aria-hidden />
              Filter runs by {run.subjectKey}
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 text-[11px]">
            <Meta
              icon={<Clock className="h-3.5 w-3.5" aria-hidden />}
              label="EXEC TIME"
              value={fmtSeconds(dur)}
            />
            <Meta
              icon={<Coins className="h-3.5 w-3.5" aria-hidden />}
              label="TOKENS"
              value={
                tokensIn != null || tokensOut != null
                  ? `${tokensIn ?? 0} in / ${tokensOut ?? 0} out`
                  : "—"
              }
            />
            <Meta
              icon={<Coins className="h-3.5 w-3.5" aria-hidden />}
              label="COST"
              value={cost != null ? `$${cost.toFixed(4)}` : "—"}
            />
          </div>

          {substeps.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1.5">
                TIMELINE
              </div>
              <ol className="border-l-2 border-[#e8e6dc] pl-3 space-y-1.5">
                {substeps.map((s, i) => (
                  <li key={`${s.name}-${i}`} className="text-[11px]">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          "inline-block h-1.5 w-1.5 rounded-full -ml-[15px]",
                          s.status === "failure"
                            ? "bg-[#a33b2b]"
                            : s.status === "success"
                              ? "bg-[#788c5d]"
                              : "bg-[#9a988e]",
                        )}
                      />
                      <span className="text-[#141413] font-medium">{s.name}</span>
                      {s.ms != null && (
                        <span className="text-[10px] text-[#9a988e] tabular-nums">
                          {fmtSeconds(s.ms / 1000)}
                        </span>
                      )}
                    </div>
                    {s.error && (
                      <div className="ml-[8px] text-[10px] text-[#a33b2b] font-mono">
                        {s.error}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {run.error && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] font-bold tracking-wider text-[#a33b2b]">
                  ERROR
                </div>
                <button
                  type="button"
                  onClick={copyStack}
                  className="inline-flex items-center gap-1 rounded border border-[#cfccc1] bg-white px-2 py-0.5 text-[10px] text-[#6b6a64] hover:border-[#d97757] transition-colors"
                >
                  {copied ? (
                    <>
                      <ClipboardCheck className="h-3 w-3" aria-hidden /> copied
                    </>
                  ) : (
                    <>
                      <Clipboard className="h-3 w-3" aria-hidden /> Copy Error Stack
                    </>
                  )}
                </button>
              </div>
              <pre className="rounded-md bg-[#141413] text-[11px] text-red-300 font-mono p-3 max-h-[160px] overflow-auto whitespace-pre-wrap">
                {run.error}
              </pre>
              {hint && (
                <div className="mt-1.5 text-[11px] text-[#6b6a64] font-serif italic">
                  Hint: {hint}
                </div>
              )}
            </div>
          )}

          {run.result != null && (
            <details className="text-[11px]">
              <summary className="cursor-pointer text-[10px] font-bold tracking-wider text-[#9a988e]">
                RAW RESULT
              </summary>
              <pre className="mt-1 rounded-md bg-white border border-[#e8e6dc] text-[10px] text-[#6b6a64] font-mono p-3 max-h-[200px] overflow-auto whitespace-pre-wrap">
                {JSON.stringify(run.result, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </article>
  );
}

function Meta({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-white border border-[#e8e6dc] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[#9a988e]">
        {icon}
        <span className="text-[10px] font-bold tracking-wider">{label}</span>
      </div>
      <div className="mt-1 text-[12px] text-[#141413] tabular-nums">
        {value}
      </div>
    </div>
  );
}
