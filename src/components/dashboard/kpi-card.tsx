import { Sparkline } from "./sparkline";

interface KpiCardProps {
  label: string;
  value: string;
  tone?: "ok" | "err" | "warn" | "neutral";
  hint?: string;
  trend?: number[];
  progressPct?: number; // 0-100; renders a thin progress bar instead of a sparkline
}

const TONE_COLOR: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  ok: "#788c5d",
  err: "#a33b2b",
  warn: "#d97757",
  neutral: "#141413",
};

const TONE_STROKE: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  ok: "#788c5d",
  err: "#a33b2b",
  warn: "#d97757",
  neutral: "#6a9bcc",
};

export function KpiCard({
  label,
  value,
  tone = "neutral",
  hint,
  trend,
  progressPct,
}: KpiCardProps) {
  const color = TONE_COLOR[tone];
  const stroke = TONE_STROKE[tone];

  return (
    <div className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">
          {label}
        </div>
        {trend && trend.length >= 2 && progressPct === undefined && (
          <Sparkline values={trend} stroke={stroke} />
        )}
      </div>
      <div
        className="text-[22px] font-semibold tabular-nums"
        style={{ color, fontFamily: "Poppins, Arial, sans-serif" }}
      >
        {value}
      </div>
      {progressPct !== undefined && (
        <div className="h-1.5 rounded-full bg-[#f3f1ea] overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.max(0, progressPct))}%`,
              backgroundColor: stroke,
            }}
          />
        </div>
      )}
      {hint && (
        <div className="text-[11px] text-[#9a988e] font-serif italic">
          {hint}
        </div>
      )}
    </div>
  );
}
