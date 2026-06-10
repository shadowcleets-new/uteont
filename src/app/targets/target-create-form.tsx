import type { ReactNode } from "react";
import { TARGET_METRICS } from "@/lib/services/targets";
import { createTargetAction } from "./actions";
import { InfoTooltip } from "@/components/info-tooltip";

const inputCls =
  "w-full rounded-md border border-[#e0ddd2] bg-white px-3 py-2 text-[13px] text-[#141413] focus:outline-none focus:border-[#d97757]";

function Field({ label, tip, children }: { label: string; tip?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] text-[#6b6a64] mb-1 inline-flex items-center gap-1.5">
        {label}
        {tip && <InfoTooltip triggerLabel={`${label} explanation`}>{tip}</InfoTooltip>}
      </span>
      {children}
    </label>
  );
}

export function TargetCreateForm({ siteId }: { siteId: number }) {
  return (
    <details className="rounded-[10px] border border-[#e8e6dc] bg-white mb-6">
      <summary className="cursor-pointer px-5 py-3 text-[13px] font-medium text-[#141413] select-none hover:bg-[#faf9f5]">
        + New target
      </summary>
      <form action={createTargetAction} className="px-5 pb-5 pt-1 grid grid-cols-1 md:grid-cols-2 gap-3">
        <input type="hidden" name="siteId" value={siteId} />
        <div className="md:col-span-2">
          <Field label="Objective">
            <input name="title" required maxLength={200} placeholder="Rank for 'B2B Textile Manufacturing'" className={inputCls} />
          </Field>
        </div>
        <Field
          label="Metric (how progress is measured)"
          tip={<><span className="font-semibold block mb-1">Metric</span>The number the trajectory tracks daily. Agent-driven metrics (audit scores, articles) move when their agent runs; Search Console / GA4 metrics move once that integration is connected.</>}
        >
          <select name="metric" defaultValue="articles_published" className={inputCls}>
            {TARGET_METRICS.map((m) => {
              const needs = m.key.startsWith("gsc_")
                ? " — needs Search Console"
                : m.key.startsWith("ga4_")
                  ? " — needs GA4 connected"
                  : "";
              return (
                <option key={m.key} value={m.key}>{m.label}{needs}</option>
              );
            })}
          </select>
          <span className="text-[10px] text-[#9a988e] mt-1 block">
            Search Console / GA4 metrics read 0 until that integration is connected on the site.
          </span>
        </Field>
        <Field
          label="Direction"
          tip={<><span className="font-semibold block mb-1">Direction</span>&ldquo;Increase&rdquo; for growth metrics (clicks, score). &ldquo;Decrease&rdquo; for problem counts (broken links, issues found) where progress means the number falling.</>}
        >
          <select name="direction" defaultValue="increase" className={inputCls}>
            <option value="increase">Increase — higher is better</option>
            <option value="decrease">Decrease — lower is better</option>
          </select>
        </Field>
        <Field label="Deadline">
          <input name="deadlineAt" type="date" required className={inputCls} />
        </Field>
        <Field
          label="Baseline (value today)"
          tip={<><span className="font-semibold block mb-1">Baseline</span>Where the metric stands right now. Progress is measured from here — an honest baseline keeps the pace and ETA projections honest.</>}
        >
          <input name="baselineValue" type="number" step="any" required defaultValue="0" className={inputCls} />
        </Field>
        <Field
          label="Goal (target value)"
          tip={<><span className="font-semibold block mb-1">Goal</span>The value that counts as done by the deadline. The trajectory band projects whether the current pace reaches this in time.</>}
        >
          <input name="goalValue" type="number" step="any" required className={inputCls} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Current value — only for the 'Manual' metric">
            <input name="manualCurrent" type="number" step="any" placeholder="(leave blank for computed metrics)" className={inputCls} />
          </Field>
        </div>
        <div className="md:col-span-2 pt-1">
          <button
            type="submit"
            className="rounded-md bg-[#d97757] text-white px-4 py-2 text-[13px] font-medium hover:bg-[#c86846] transition-colors"
          >
            Create target
          </button>
        </div>
      </form>
    </details>
  );
}
