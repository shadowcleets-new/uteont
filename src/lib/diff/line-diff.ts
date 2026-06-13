/**
 * @file line-diff.ts
 * @description LO-17 — a small, dependency-free line diff for the approvals
 * diff-review surface. Classic LCS (longest common subsequence) over lines,
 * emitting context/add/remove rows in original order. Pure + tested. Not a
 * minimal-edit Myers diff — line-level LCS is plenty for reviewing a proposed
 * page edit before it applies.
 */

export type DiffKind = "context" | "add" | "remove";

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

export function computeLineDiff(before: string, after: string): DiffLine[] {
  const a = before.length === 0 ? [] : before.split("\n");
  const b = after.length === 0 ? [] : after.split("\n");
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  // Walk the table, emitting rows in order.
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "context", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "remove", text: a[i] });
      i++;
    } else {
      out.push({ kind: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: "remove", text: a[i++] });
  while (j < m) out.push({ kind: "add", text: b[j++] });
  return out;
}
