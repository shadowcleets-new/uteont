"use client";

import { useState } from "react";
import { frictionFor, type Verb } from "@/lib/services/checkpoint-machine";

export interface CheckpointView {
  id: number;
  gate: string;
  title: string;
  summary: string | null;
  blastRadius: number;
  createdAt: string;
}

const VERB_STYLE: Record<string, { label: string; cls: string }> = {
  approve: { label: "Approve", cls: "bg-[#788c5d] text-white hover:bg-[#6a7d52]" },
  edit: { label: "Edit", cls: "bg-[#d97757] text-white hover:bg-[#c66948]" },
  reject: { label: "Reject", cls: "bg-white text-[#a33b2b] border border-[#e8c9c2] hover:bg-[#fbf2ef]" },
  defer: { label: "Defer", cls: "bg-white text-[#6b6a64] border border-[#e8e6dc] hover:bg-[#faf9f5]" },
  escalate: { label: "Escalate", cls: "bg-white text-[#8a6516] border border-[#ecdcb4] hover:bg-[#faf7f0]" },
};

export function ApprovalsClient({ initial }: { initial: CheckpointView[] }) {
  const [items, setItems] = useState<CheckpointView[]>(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const decide = async (cp: CheckpointView, verb: Verb) => {
    setErr(null);
    const friction = frictionFor(cp.blastRadius);
    if (friction === "confirm" && !window.confirm(`${verb.toUpperCase()} "${cp.title}" — affects ${cp.blastRadius} items. Continue?`)) return;
    if (friction === "type-to-confirm") {
      const typed = window.prompt(`This affects ${cp.blastRadius} items. Type CONFIRM to ${verb}.`);
      if (typed !== "CONFIRM") return;
    }
    setBusy(cp.id);
    try {
      const res = await fetch(`/api/checkpoints/${cp.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verb }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "decision failed");
      }
      // Defer/escalate keep it open elsewhere; remove from this pending view either way.
      setItems((l) => l.filter((x) => x.id !== cp.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "decision failed");
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
        <p className="text-[12px] text-[#9a988e] italic font-serif">
          No pending approvals. Checkpoints appear here when an agent proposes an action that needs sign-off.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {err && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
      {items.map((cp) => {
        const friction = frictionFor(cp.blastRadius);
        return (
          <div key={cp.id} className="rounded-[10px] border border-[#e8e6dc] bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-[#f0eee6] text-[#6b6a64]">
                    GATE {cp.gate}
                  </span>
                  <h3 className="text-[15px] font-semibold text-[#141413] truncate">{cp.title}</h3>
                </div>
                {cp.summary && <p className="text-[12px] text-[#6b6a64] mt-1">{cp.summary}</p>}
                <p className="text-[11px] text-[#9a988e] mt-1.5">
                  blast radius <b className="text-[#141413]">{cp.blastRadius}</b>
                  {friction !== "none" && (
                    <span className="ml-2 text-[#8a6516]">· {friction === "type-to-confirm" ? "type-to-confirm" : "confirm"} required</span>
                  )}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(Object.keys(VERB_STYLE) as Verb[]).map((verb) => (
                <button
                  key={verb}
                  disabled={busy === cp.id}
                  onClick={() => decide(cp, verb)}
                  className={`rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50 ${VERB_STYLE[verb].cls}`}
                >
                  {VERB_STYLE[verb].label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
