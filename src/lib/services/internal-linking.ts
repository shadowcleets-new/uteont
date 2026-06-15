/**
 * Internal-linking optimizer (IP-41).
 *
 * Pure recommendations over a site's link graph: for each target page, suggest
 * the highest-authority source pages that don't yet link to it, so editors can
 * route inbound authority toward the pages they want to rank. No I/O, no clock,
 * no randomness — fully deterministic and unit-testable.
 */

// #region Types

export interface GraphNode {
  url: string;
  outlinks: string[];
  /** Inbound internal links; treated as 0 when omitted. Higher = more authority. */
  inlinks?: number;
}

export interface LinkGraph {
  pages: GraphNode[];
}

export interface LinkRecommendation {
  from: string;
  to: string;
  reason: string;
  sourceAuthority: number;
}

interface RecommendOptions {
  /** Max recommendations per target. Defaults to 3. */
  maxPerTarget?: number;
}

// #endregion

// #region Constants

const DEFAULT_MAX_PER_TARGET = 3;

// #endregion

// #region Core

export function recommendInternalLinks(
  graph: LinkGraph,
  targetUrls: string[],
  opts: RecommendOptions = {},
): LinkRecommendation[] {
  const maxPerTarget = opts.maxPerTarget ?? DEFAULT_MAX_PER_TARGET;
  const nodesByUrl = new Map(graph.pages.map((p) => [p.url, p]));
  const recommendations: LinkRecommendation[] = [];

  for (const target of targetUrls) {
    // Skip targets that don't exist as nodes in the graph.
    if (!nodesByUrl.has(target)) continue;

    const candidates = graph.pages
      .filter((page) => isCandidate(page, target))
      .sort(byAuthorityThenUrl)
      .slice(0, Math.max(0, maxPerTarget));

    for (const page of candidates) {
      const authority = authorityOf(page);
      recommendations.push({
        from: page.url,
        to: target,
        reason: `high-authority page (${authority} inlinks) does not yet link to ${target}`,
        sourceAuthority: authority,
      });
    }
  }

  return recommendations;
}

// #endregion

// #region Helpers

/** A page can pass authority to the target unless it IS the target or already links to it. */
function isCandidate(page: GraphNode, target: string): boolean {
  return page.url !== target && !page.outlinks.includes(target);
}

function authorityOf(page: GraphNode): number {
  return page.inlinks ?? 0;
}

/** Descending authority, then alphabetical url as a deterministic tie-break. */
function byAuthorityThenUrl(a: GraphNode, b: GraphNode): number {
  const diff = authorityOf(b) - authorityOf(a);
  if (diff !== 0) return diff;
  return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
}

// #endregion
