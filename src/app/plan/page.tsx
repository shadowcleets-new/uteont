import Link from "next/link";
import { getActiveSiteId } from "@/lib/services/app-settings";
import { PickASite } from "@/components/pick-a-site";
import { LiveJobs } from "@/components/live-jobs";
import { getActivePlanForSite, listPlansForSite } from "@/lib/services/plans";
import { parsePlanSteps, type PlanStep } from "@/lib/services/plan-types";
import type { Plan } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan — UTEONT" };

const STATUS_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "AWAITING YOUR GO", bg: "#f6ecd6", fg: "#8a6516" },
  active: { label: "RUNNING", bg: "#eef2e9", fg: "#4a6b2f" },
  "paused-gate": { label: "WAITING FOR YOUR REVIEW", bg: "#f6ecd6", fg: "#8a6516" },
  completed: { label: "COMPLETED", bg: "#eef2e9", fg: "#4a6b2f" },
  failed: { label: "FAILED", bg: "#f6e0db", fg: "#a33b2b" },
  cancelled: { label: "CANCELLED", bg: "#f0eee6", fg: "#9a988e" },
};

const STEP_DOT: Record<PlanStep["status"], string> = {
  pending: "#cfccc1",
  running: "#d97757",
  "awaiting-gate": "#b8862f",
  done: "#788c5d",
  failed: "#a33b2b",
  skipped: "#9a988e",
};

function safeSteps(plan: Plan): PlanStep[] {
  try {
    return parsePlanSteps(plan.steps);
  } catch {
    return [];
  }
}

function PlanCard({ plan }: { plan: Plan }) {
  const steps = safeSteps(plan);
  const s = STATUS_STYLE[plan.status] ?? STATUS_STYLE.cancelled;
  const doneCount = steps.filter((x) => ["done", "skipped"].includes(x.status)).length;
  // A running step with no results after 10 min usually means the Railway
  // worker isn't polling — surface that instead of looking silently stuck.
  // Server component rendered per request (force-dynamic), so reading the
  // clock here is fresh and safe.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const maybeStuck =
    plan.status === "active" &&
    steps.some((x) => x.status === "running" && !(x.runIds?.length)) &&
    nowMs - new Date(plan.updatedAt as unknown as string).getTime() > 10 * 60 * 1000;

  return (
    <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5 mb-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="text-[15px] font-semibold text-[#141413]">
          Plan #{plan.id} — {plan.goal}
        </h2>
        <span
          className="text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full shrink-0"
          style={{ background: s.bg, color: s.fg }}
        >
          {s.label}
        </span>
      </div>
      <p className="text-[12px] text-[#6b6a64] mb-3">
        {doneCount} of {steps.length} steps done
        {plan.currentStep > 0 && plan.status !== "completed" ? ` · currently on step ${plan.currentStep}` : ""}
      </p>
      <div className="h-1.5 rounded-full bg-[#f0eee6] overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-[#788c5d]"
          style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }}
        />
      </div>
      {maybeStuck && (
        <p className="text-[12px] text-[#a33b2b] mb-3">
          The current step has produced nothing for over 10 minutes — the worker (Railway) may not be running.
        </p>
      )}
      <ol className="space-y-2">
        {steps.map((step) => (
          <li key={step.n} className="flex items-baseline gap-2.5 text-[13px]">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0 translate-y-[-1px]"
              style={{ background: STEP_DOT[step.status] }}
            />
            <span className="text-[#9a988e] tabular-nums shrink-0">{step.n}.</span>
            <span className="min-w-0">
              <span className="text-[#141413]">
                {step.gated ? "🔒 " : ""}
                {step.title}
              </span>
              {step.how && <span className="text-[#6b6a64]"> — {step.how}</span>}
              <span className="text-[11px] text-[#9a988e]"> · {step.status}</span>
              {step.status === "awaiting-gate" && (
                <>
                  {" "}
                  <Link href="/approvals" className="text-[11px] text-[#d97757] underline">
                    review in Approvals →
                  </Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default async function PlanPage() {
  const activeSiteId = await getActiveSiteId();
  if (!activeSiteId) return <PickASite />;

  const inFlight = await getActivePlanForSite(activeSiteId).catch(() => null);
  const recent = (await listPlansForSite(activeSiteId, 8).catch(() => [])).filter(
    (p) => p.id !== inFlight?.id,
  );
  const current = inFlight ?? recent.shift() ?? null;

  return (
    <div className="px-9 py-8 max-w-[900px]">
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-2">Plan</h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        The Director&apos;s approved plan and where it stands. It runs on its own and pauses at 🔒
        review gates — approve those in{" "}
        <Link href="/approvals" className="underline">Approvals</Link>.
      </p>

      <LiveJobs />

      {!current ? (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
          <p className="text-[12px] text-[#9a988e] italic font-serif">
            No plans yet. Tell the{" "}
            <Link href="/chat" className="underline text-[#d97757]">Director</Link> a goal and it
            will propose one.
          </p>
        </div>
      ) : (
        <PlanCard plan={current} />
      )}

      {recent.length > 0 && (
        <>
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-2 mt-8">
            EARLIER PLANS
          </div>
          {recent.map((p) => (
            <div
              key={p.id}
              className="rounded-[10px] border border-[#e8e6dc] bg-white px-4 py-3 mb-2 flex items-center justify-between gap-3 text-[13px]"
            >
              <span className="text-[#141413] truncate">#{p.id} — {p.goal}</span>
              <span className="text-[11px] text-[#9a988e] shrink-0">{p.status}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
