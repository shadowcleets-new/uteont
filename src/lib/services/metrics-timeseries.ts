/**
 * @file metrics-timeseries.ts
 * @description IP-10 — the per-(page|query|site) measurement substrate. GSC/GA4
 * history was fetched on demand but never stored, so trend/decay/re-optimization
 * math had no memory. This service persists one row per
 * (site, entity_type, entity_key, metric, day) and reads it back as a chronological
 * series. Every read/write is defensive: a missing `metrics_timeseries` table (the
 * migration is staged but applied operator-side) degrades to a no-op / empty rather
 * than throwing. Upserts are idempotent on the day key — a same-day cron re-run
 * overwrites, never duplicates.
 *
 * [TABLE OF CONTENTS]
 * 1. IMPORTS & TYPES
 * 2. WRITE — upsertMetric / recordSiteDaily
 * 3. READ — seriesFor / latestFor
 */

// #region 1. Imports & types
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { metricsTimeseries } from "@/lib/db/schema";

export type EntityType = "page" | "query" | "site";

export interface MetricPoint {
  day: string; // YYYY-MM-DD
  value: number;
}

export interface UpsertMetricInput {
  siteId: number;
  entityType: EntityType;
  entityKey: string;
  metric: string;
  value: number;
  capturedOn?: string; // YYYY-MM-DD; defaults to today (UTC)
}

/** Pure: today's date as a UTC YYYY-MM-DD string (caller may override). */
export function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}
// #endregion

// #region 2. Write
/**
 * Idempotent upsert keyed on (site, entity_type, entity_key, metric, day). A
 * re-run on the same day overwrites the value rather than inserting a duplicate.
 * Best-effort — a missing table never breaks the caller (e.g. the daily cron).
 */
export async function upsertMetric(input: UpsertMetricInput): Promise<boolean> {
  if (!Number.isFinite(input.value)) return false;
  const capturedOn = input.capturedOn ?? new Date().toISOString().slice(0, 10);
  try {
    const db = getDb();
    await db
      .insert(metricsTimeseries)
      .values({
        siteId: input.siteId,
        entityType: input.entityType,
        entityKey: input.entityKey,
        metric: input.metric,
        value: input.value,
        capturedOn,
      })
      .onConflictDoUpdate({
        target: [
          metricsTimeseries.siteId,
          metricsTimeseries.entityType,
          metricsTimeseries.entityKey,
          metricsTimeseries.metric,
          metricsTimeseries.capturedOn,
        ],
        set: { value: input.value },
      });
    return true;
  } catch (e) {
    console.warn("upsertMetric failed (table may not exist yet)", e);
    return false;
  }
}

/**
 * Persist a batch of site-level daily metrics (entity_type='site', entity_key=the
 * site domain or "site"). Used by the daily cron after the GSC pull so the
 * substrate accrues a real series even before per-page/per-query expansion lands.
 * Returns the count successfully written.
 */
export async function recordSiteDaily(
  siteId: number,
  entityKey: string,
  metrics: Record<string, number | null | undefined>,
  capturedOn?: string,
): Promise<number> {
  let written = 0;
  for (const [metric, raw] of Object.entries(metrics)) {
    if (raw == null || !Number.isFinite(raw)) continue;
    const ok = await upsertMetric({
      siteId,
      entityType: "site",
      entityKey,
      metric,
      value: Number(raw),
      capturedOn,
    });
    if (ok) written++;
  }
  return written;
}
// #endregion

// #region 3. Read
/**
 * Chronological series for a single (site, entity, metric) over the last `days`
 * captured points. Defensive — returns [] if the table is missing.
 */
export async function seriesFor(
  siteId: number,
  entityKey: string,
  metric: string,
  days = 90,
): Promise<MetricPoint[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({ day: metricsTimeseries.capturedOn, value: metricsTimeseries.value })
      .from(metricsTimeseries)
      .where(
        and(
          eq(metricsTimeseries.siteId, siteId),
          eq(metricsTimeseries.entityKey, entityKey),
          eq(metricsTimeseries.metric, metric),
        ),
      )
      .orderBy(asc(metricsTimeseries.capturedOn))
      .limit(days);
    return rows.map((r) => ({ day: String(r.day), value: Number(r.value) }));
  } catch (e) {
    console.warn("seriesFor failed (table may not exist yet)", e);
    return [];
  }
}

/** The most recent value for a (site, entity, metric), or null. Defensive. */
export async function latestFor(
  siteId: number,
  entityKey: string,
  metric: string,
): Promise<MetricPoint | null> {
  const series = await seriesFor(siteId, entityKey, metric, 365);
  return series.length ? series[series.length - 1] : null;
}
// #endregion
