/**
 * Trajectory "intervention markers" — when an operator actually acted on a
 * target's metric (i.e. dispatched the agent that moves it). The pure transform
 * is unit-tested; the DB wrapper reads recent runs for the metric's producing
 * agent on the target's site.
 */

import { listRuns } from "./runs";
import { agentForMetric } from "./next-action";

export interface RunLike {
  startedAt: Date | string | number | null;
  status: string;
}

export interface Intervention {
  atMs: number;
  label: string;
}

/** Pure: map agent runs to trajectory intervention ticks (one per dispatch). */
export function runsToInterventions(runs: RunLike[], label: string): Intervention[] {
  const out: Intervention[] = [];
  for (const r of runs) {
    if (r.startedAt == null) continue;
    const atMs =
      r.startedAt instanceof Date
        ? r.startedAt.getTime()
        : typeof r.startedAt === "number"
          ? r.startedAt
          : Date.parse(r.startedAt);
    if (!Number.isFinite(atMs)) continue;
    out.push({ atMs, label: `${label} — ${r.status}` });
  }
  return out;
}

/** Recent runs of the agent that moves this metric, on this site, as interventions. */
export async function getInterventionsForTarget(
  siteId: number,
  metric: string,
  limit = 12,
): Promise<Intervention[]> {
  const { agentKey, label } = agentForMetric(metric);
  if (!agentKey) return [];
  try {
    const runs = await listRuns(`agent.${agentKey}`, limit, { siteId });
    return runsToInterventions(runs as RunLike[], label || agentKey);
  } catch {
    return [];
  }
}
