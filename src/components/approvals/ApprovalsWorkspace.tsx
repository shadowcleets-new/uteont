"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleSlash,
  Inbox,
  XCircle,
} from "lucide-react";
import { Markdown } from "@/lib/markdown/render";
import { cn } from "@/lib/utils";
import type { PendingApproval } from "@/lib/services/approvals-queue";

type Decision = "approve" | "shelf" | "reject";

interface ApprovalsWorkspaceProps {
  initial: PendingApproval[];
}

interface ActionResult {
  ok: boolean;
  error?: string;
}

async function patchTarget(
  item: PendingApproval,
  status: string,
): Promise<ActionResult> {
  const url = item.kind === "article"
    ? `/api/articles/${item.id}`
    : `/api/ideas/${item.id}`;
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function recordDecision(
  item: PendingApproval,
  decision: "approve" | "reject" | "edit",
  note?: string,
): Promise<ActionResult> {
  try {
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gate: item.kind === "article" ? "B" : "A",
        targetType: item.kind,
        targetId: item.id,
        decision,
        note,
        channel: "web",
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function ApprovalsWorkspace({ initial }: ApprovalsWorkspaceProps) {
  const [items, setItems] = useState<PendingApproval[]>(initial);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initial.length ? `${initial[0].kind}-${initial[0].id}` : null,
  );
  const [submitting, setSubmitting] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);

  const selected = useMemo(
    () => items.find((i) => `${i.kind}-${i.id}` === selectedKey) ?? null,
    [items, selectedKey],
  );

  // Auto-select the head of the queue when the current selection is removed.
  useEffect(() => {
    if (selected) return;
    setSelectedKey(items.length ? `${items[0].kind}-${items[0].id}` : null);
  }, [items, selected]);

  // Focus the feedback textarea when the user opens Reject & Refine.
  useEffect(() => {
    if (rejectOpen) feedbackRef.current?.focus();
  }, [rejectOpen]);

  async function handleDecision(decision: Decision) {
    if (!selected || submitting) return;
    if (decision === "reject" && !rejectOpen) {
      setRejectOpen(true);
      return;
    }
    setSubmitting(decision);
    setError(null);

    // Optimistic removal — re-insert on failure.
    const removed = selected;
    const removedKey = `${removed.kind}-${removed.id}`;
    setItems((prev) => prev.filter((i) => `${i.kind}-${i.id}` !== removedKey));
    setRejectOpen(false);

    const targetStatus =
      decision === "approve"
        ? removed.kind === "article" ? "approved" : "approved"
        : decision === "shelf"
          ? "shelved"
          : "rejected";

    const patch = await patchTarget(removed, targetStatus);
    if (!patch.ok) {
      setItems((prev) => [removed, ...prev]);
      setSelectedKey(removedKey);
      setError(`Status update failed: ${patch.error}`);
      setSubmitting(null);
      return;
    }
    const decisionKind =
      decision === "approve" ? "approve" :
        decision === "reject" ? "reject" : "edit";
    const note = decision === "reject" ? feedback : undefined;
    const audit = await recordDecision(removed, decisionKind, note);
    if (!audit.ok) {
      // The status patch already landed; surface a warning but don't undo it.
      setError(`Decision recorded with warning: audit log failed (${audit.error})`);
    }
    setFeedback("");
    setSubmitting(null);
  }

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[40%_60%] gap-3 min-h-[70vh]">
      {/* LIST */}
      <aside className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#e8e6dc] flex items-center justify-between">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">
            QUEUE
          </div>
          <div className="text-[11px] text-[#6b6a64] tabular-nums">
            {items.length} pending
          </div>
        </div>
        {items.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Inbox
              aria-hidden
              className="mx-auto h-8 w-8 text-[#cfccc1] mb-3"
            />
            <p className="text-[13px] text-[#6b6a64] font-serif italic">
              Inbox zero — nothing waiting on your review.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#f3f1ea] max-h-[70vh] overflow-y-auto">
            {items.map((item) => {
              const key = `${item.kind}-${item.id}`;
              const active = selectedKey === key;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={cn(
                      "w-full text-left px-4 py-3 transition-colors",
                      "hover:bg-[#faf9f5]",
                      active && "bg-[#f3f1ea] border-l-[3px] border-[#d97757] pl-[13px]",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold tracking-wider text-[#9a988e] uppercase">
                        {item.kind}
                      </span>
                      <span className="text-[10px] text-[#9a988e]">·</span>
                      <span className="text-[10px] text-[#9a988e] tabular-nums">
                        #{item.id}
                      </span>
                    </div>
                    <div className="text-[13px] font-medium text-[#141413] line-clamp-2">
                      {item.title}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {/* DETAIL */}
      <section className="relative rounded-[10px] border border-[#e8e6dc] bg-white flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center px-10 py-16 text-center">
            <div>
              <CheckCircle2
                aria-hidden
                className="mx-auto h-10 w-10 text-[#cfccc1] mb-3"
              />
              <p className="text-[13px] text-[#6b6a64] font-serif italic">
                Nothing to review. The Director will surface new items here
                as the pipeline produces them.
              </p>
            </div>
          </div>
        ) : (
          <>
            <header className="px-6 py-4 border-b border-[#e8e6dc]">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold tracking-wider text-[#9a988e] uppercase">
                  {selected.kind}
                </span>
                <span className="text-[10px] text-[#9a988e]">·</span>
                <span className="text-[10px] text-[#9a988e] tabular-nums">
                  #{selected.id}
                </span>
                {selected.kind === "article" && selected.meta.qaScore != null && (
                  <>
                    <span className="text-[10px] text-[#9a988e]">·</span>
                    <span className="text-[10px] text-[#788c5d] tabular-nums">
                      QA {selected.meta.qaScore}
                    </span>
                  </>
                )}
                {selected.kind === "article" && selected.meta.seoScore != null && (
                  <>
                    <span className="text-[10px] text-[#9a988e]">·</span>
                    <span className="text-[10px] text-[#6a9bcc] tabular-nums">
                      SEO {selected.meta.seoScore}
                    </span>
                  </>
                )}
                {selected.kind === "idea" && selected.meta.intent && (
                  <>
                    <span className="text-[10px] text-[#9a988e]">·</span>
                    <span className="text-[10px] text-[#9a988e] uppercase">
                      {selected.meta.intent}
                    </span>
                  </>
                )}
              </div>
              <h2 className="text-[20px] font-semibold text-[#141413] tracking-tight">
                {selected.title}
              </h2>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5 pb-32">
              <Markdown source={selected.body} />
            </div>

            {/* Sticky action bar */}
            <div className="sticky bottom-0 left-0 right-0 border-t border-[#e8e6dc] bg-white/95 backdrop-blur px-6 py-3">
              {error && (
                <div className="mb-2 text-[12px] text-[#a33b2b] font-mono">
                  {error}
                </div>
              )}
              {rejectOpen && (
                <div className="mb-3">
                  <label
                    htmlFor="reject-feedback"
                    className="block text-[10px] font-bold tracking-wider text-[#9a988e] mb-1"
                  >
                    REJECT & REFINE — feedback for the writing agent
                  </label>
                  <textarea
                    id="reject-feedback"
                    ref={feedbackRef}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={3}
                    placeholder="What needs to change? (tone, factual errors, missing angle…)"
                    className="w-full rounded-md border border-[#e8e6dc] bg-white px-3 py-2 text-[13px] text-[#141413] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d97757]"
                  />
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-[#9a988e]">
                  {selected.kind === "article"
                    ? "Article — gate B (content)"
                    : "Idea — gate A (selection)"}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!!submitting}
                    onClick={() => handleDecision("shelf")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border border-[#d97757] text-[#d97757] px-3 py-1.5 text-[12px] font-medium",
                      "hover:bg-[#fef3eb] transition-colors disabled:opacity-50",
                    )}
                  >
                    <CircleSlash className="h-3.5 w-3.5" aria-hidden />
                    {submitting === "shelf" ? "Shelving…" : "Shelf Draft"}
                  </button>
                  <button
                    type="button"
                    disabled={!!submitting || (rejectOpen && feedback.trim().length === 0)}
                    onClick={() => handleDecision("reject")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border border-[#a33b2b] text-[#a33b2b] px-3 py-1.5 text-[12px] font-medium",
                      "hover:bg-[#fbeceb] transition-colors disabled:opacity-50",
                    )}
                  >
                    <XCircle className="h-3.5 w-3.5" aria-hidden />
                    {submitting === "reject"
                      ? "Rejecting…"
                      : rejectOpen
                        ? "Send notes"
                        : "Reject & Edit"}
                  </button>
                  <button
                    type="button"
                    disabled={!!submitting}
                    onClick={() => handleDecision("approve")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md bg-[#788c5d] text-white px-3 py-1.5 text-[12px] font-medium",
                      "hover:bg-[#6a7d54] transition-colors disabled:opacity-50",
                    )}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    {submitting === "approve" ? "Publishing…" : "Approve & Publish"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
