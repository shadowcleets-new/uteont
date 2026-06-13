"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Inbox } from "lucide-react";
import { frictionFor, VERBS, type Verb } from "@/lib/services/checkpoint-machine";
import { Markdown } from "@/lib/markdown/render";
import { computeLineDiff } from "@/lib/diff/line-diff";
import { cn } from "@/lib/utils";

/** LO-17: unified line diff of a proposed page edit (before → after). */
function DiffView({ before, after }: { before: string; after: string }) {
  const lines = computeLineDiff(before, after);
  const added = lines.filter((l) => l.kind === "add").length;
  const removed = lines.filter((l) => l.kind === "remove").length;
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-bold tracking-wider text-[#9a988e]">PROPOSED CHANGES</span>
        <span className="text-[10px] text-[#4a6b2f]">+{added}</span>
        <span className="text-[10px] text-[#a33b2b]">−{removed}</span>
      </div>
      <pre className="rounded-md border border-[#e8e6dc] bg-white text-[11px] font-mono leading-[1.5] p-0 max-h-[360px] overflow-auto">
        {lines.map((l, i) => (
          <div
            key={i}
            className={cn(
              "px-3 whitespace-pre-wrap",
              l.kind === "add" && "bg-[#eef5e8] text-[#3d6b35]",
              l.kind === "remove" && "bg-[#fbeea] text-[#a33b2b]",
              l.kind === "context" && "text-[#6b6a64]",
            )}
          >
            <span className="select-none opacity-50 mr-2">
              {l.kind === "add" ? "+" : l.kind === "remove" ? "−" : " "}
            </span>
            {l.text || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}

export interface CheckpointView {
  id: number;
  gate: string;
  title: string;
  summary: string | null;
  blastRadius: number;
  createdAt: string;
  /** { agentKey, jobId, runId, result } captured at checkpoint creation. */
  payload: Record<string, unknown> | null;
}

const VERB_STYLE: Record<Verb, { label: string; cls: string }> = {
  approve: { label: "Approve", cls: "bg-[#788c5d] text-white hover:bg-[#6a7d52]" },
  edit: { label: "Edit", cls: "bg-[#d97757] text-white hover:bg-[#c66948]" },
  reject: { label: "Reject", cls: "bg-white text-[#a33b2b] border border-[#e8c9c2] hover:bg-[#fbf2ef]" },
  defer: { label: "Defer", cls: "bg-white text-[#6b6a64] border border-[#e8e6dc] hover:bg-[#faf9f5]" },
  escalate: { label: "Escalate", cls: "bg-white text-[#8a6516] border border-[#ecdcb4] hover:bg-[#faf7f0]" },
};

/** Verbs whose intent benefits from a note for the agent / the ledger. */
const NOTE_VERBS: Verb[] = ["reject", "edit", "escalate"];

interface IdeaRow {
  keyword?: string;
  angle?: string;
  brief?: string;
  intent?: string;
}

/** Payload-aware detail body: draft markdown, idea list, outreach email, or raw JSON. */
function PayloadDetail({ payload }: { payload: Record<string, unknown> | null }) {
  if (!payload) return null;
  const agentKey = typeof payload.agentKey === "string" ? payload.agentKey : null;
  const result = (payload.result ?? null) as Record<string, unknown> | null;

  // LO-17: when the checkpoint carries a before/after (a proposed page edit),
  // lead with the diff so the operator reviews the change, not just the result.
  const before = typeof payload.before === "string" ? payload.before : null;
  const after =
    typeof payload.after === "string"
      ? payload.after
      : typeof result?.body === "string"
        ? result.body
        : null;
  const diff = before != null && after != null ? <DiffView before={before} after={after} /> : null;

  if (!result) return diff;

  if (agentKey === "content-writing" && typeof result.body === "string") {
    return (
      <>
        {diff}
        <Markdown source={result.body} />
      </>
    );
  }

  if (agentKey === "idea-generation" && Array.isArray(result.ideas)) {
    const ideas = result.ideas as IdeaRow[];
    return (
      <ol className="space-y-4">
        {ideas.map((idea, i) => (
          <li key={i} className="rounded-md border border-[#f3f1ea] bg-[#faf9f5] px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-[#9a988e] tabular-nums">#{i + 1}</span>
              {idea.intent && (
                <span className="text-[10px] font-bold tracking-wider text-[#9a988e] uppercase">{idea.intent}</span>
              )}
              {idea.keyword && (
                <span className="text-[10px] text-[#6b6a64] font-mono truncate">{idea.keyword}</span>
              )}
            </div>
            <div className="text-[13px] font-medium text-[#141413]">{idea.angle}</div>
            {idea.brief && <p className="text-[12px] text-[#6b6a64] font-serif mt-1">{idea.brief}</p>}
          </li>
        ))}
      </ol>
    );
  }

  if (agentKey === "backlink") {
    const subject = typeof result.subject === "string" ? result.subject : null;
    const emailBody =
      typeof result.email === "string" ? result.email : typeof result.body === "string" ? result.body : null;
    if (subject || emailBody) {
      return (
        <div className="rounded-md border border-[#f3f1ea] bg-[#faf9f5] px-4 py-3">
          {subject && (
            <div className="text-[12px] mb-2">
              <span className="text-[10px] font-bold tracking-wider text-[#9a988e]">SUBJECT </span>
              <span className="text-[#141413] font-medium">{subject}</span>
            </div>
          )}
          {emailBody && <Markdown source={emailBody} />}
        </div>
      );
    }
  }

  return (
    <details className="text-[11px]">
      <summary className="cursor-pointer text-[10px] font-bold tracking-wider text-[#9a988e]">RAW RESULT</summary>
      <pre className="mt-1 rounded-md bg-white border border-[#e8e6dc] text-[10px] text-[#6b6a64] font-mono p-3 max-h-[320px] overflow-auto whitespace-pre-wrap">
        {JSON.stringify(result, null, 2)}
      </pre>
    </details>
  );
}

export function ApprovalsClient({ initial }: { initial: CheckpointView[] }) {
  const [items, setItems] = useState<CheckpointView[]>(initial);
  const [selectedId, setSelectedId] = useState<number | null>(initial[0]?.id ?? null);
  const [busy, setBusy] = useState<Verb | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  // The note box is bound to a specific checkpoint id, so a draft typed
  // for one item can never surface on (or ride along with) another.
  const [noteFor, setNoteFor] = useState<{ id: number; verb: Verb } | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  // LO-18: the just-decided checkpoint, offered for undo for a short window.
  const [lastDecided, setLastDecided] = useState<{ item: CheckpointView; verb: Verb } | null>(null);
  const [undoing, setUndoing] = useState(false);

  async function undoLast() {
    if (!lastDecided || undoing) return;
    setUndoing(true);
    setErr(null);
    try {
      const res = await fetch(`/api/checkpoints/${lastDecided.item.id}/undo`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "undo failed");
      }
      setItems((prev) => [lastDecided.item, ...prev.filter((i) => i.id !== lastDecided.item.id)]);
      setSelectedId(lastDecided.item.id);
      setLastDecided(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "undo failed");
    } finally {
      setUndoing(false);
    }
  }

  // Honour the explicit pick while it's still queued, else fall back to the head.
  const effectiveId = useMemo(() => {
    if (selectedId != null && items.some((i) => i.id === selectedId)) return selectedId;
    return items[0]?.id ?? null;
  }, [items, selectedId]);

  const selected = useMemo(
    () => items.find((i) => i.id === effectiveId) ?? null,
    [items, effectiveId],
  );

  useEffect(() => {
    if (noteFor) noteRef.current?.focus();
  }, [noteFor]);

  const noteOpenForSelected =
    selected != null && noteFor != null && noteFor.id === selected.id;

  async function decide(verb: Verb) {
    if (!selected || busy) return;

    // First click on a note-bearing verb opens the note box for THIS
    // checkpoint; the second click sends. A box opened on a different
    // checkpoint (or verb) never satisfies the guard.
    const armed = noteOpenForSelected && noteFor.verb === verb;
    if (NOTE_VERBS.includes(verb) && !armed) {
      if (!noteOpenForSelected) setNote(""); // drop any stale draft from another item
      setNoteFor({ id: selected.id, verb });
      return;
    }

    // Graduated friction from the checkpoint machine.
    const friction = frictionFor(selected.blastRadius);
    if (
      friction === "confirm" &&
      !window.confirm(`${verb.toUpperCase()} "${selected.title}" — affects ${selected.blastRadius} items. Continue?`)
    )
      return;
    if (friction === "type-to-confirm") {
      const typed = window.prompt(`This affects ${selected.blastRadius} items. Type CONFIRM to ${verb}.`);
      if (typed !== "CONFIRM") return;
    }

    setBusy(verb);
    setErr(null);
    const removed = selected;
    setItems((prev) => prev.filter((i) => i.id !== removed.id)); // optimistic
    setNoteFor(null);

    try {
      // The note belongs to this checkpoint + verb only — a stray draft must
      // not ride along with Approve/Defer or a different item's decision.
      const noteToSend =
        noteFor?.id === removed.id && noteFor.verb === verb && note.trim()
          ? note.trim()
          : undefined;
      const res = await fetch(`/api/checkpoints/${removed.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verb, note: noteToSend }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "decision failed");
      }
      setNote("");
      // LO-18: offer undo for terminal decisions (approve/reject/edit). Defer/
      // escalate keep the item actionable, so there's nothing to undo.
      if (verb === "approve" || verb === "reject" || verb === "edit") {
        setLastDecided({ item: removed, verb });
        window.setTimeout(() => setLastDecided((cur) => (cur?.item.id === removed.id ? null : cur)), 5 * 60 * 1000);
      }
    } catch (e) {
      setItems((prev) => [removed, ...prev]); // roll back
      setSelectedId(removed.id);
      setErr(e instanceof Error ? e.message : "decision failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[38%_62%] gap-3 min-h-[70vh]">
      {/* LO-18: undo toast — re-open the just-decided checkpoint within the window. */}
      {lastDecided && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-[10px] border border-[#e8e6dc] bg-[#141413] text-white px-4 py-2.5 shadow-lg">
          <span className="text-[12px]">
            {lastDecided.verb}d <span className="font-medium">{lastDecided.item.title}</span>
          </span>
          <button
            type="button"
            onClick={undoLast}
            disabled={undoing}
            className="text-[12px] font-semibold text-[#f0a48b] hover:text-white transition-colors disabled:opacity-50"
          >
            {undoing ? "Undoing…" : "Undo"}
          </button>
          <button
            type="button"
            onClick={() => setLastDecided(null)}
            className="text-[12px] text-[#9a988e] hover:text-white"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {/* QUEUE */}
      <aside className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-hidden self-start">
        <div className="px-4 py-2.5 border-b border-[#e8e6dc] flex items-center justify-between">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">QUEUE</div>
          <div className="text-[11px] text-[#6b6a64] tabular-nums">{items.length} pending</div>
        </div>
        {items.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Inbox aria-hidden className="mx-auto h-8 w-8 text-[#cfccc1] mb-3" />
            <p className="text-[13px] text-[#6b6a64] font-serif italic">
              Inbox zero — nothing waiting on your review.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#f3f1ea] max-h-[70vh] overflow-y-auto">
            {items.map((cp) => {
              const active = effectiveId === cp.id;
              const friction = frictionFor(cp.blastRadius);
              return (
                <li key={cp.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(cp.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 transition-colors hover:bg-[#faf9f5]",
                      active && "bg-[#f3f1ea] border-l-[3px] border-[#d97757] pl-[13px]",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-[#f0eee6] text-[#6b6a64]">
                        GATE {cp.gate}
                      </span>
                      <span className="text-[10px] text-[#9a988e] tabular-nums">#{cp.id}</span>
                      {friction !== "none" && (
                        <span className="text-[9px] text-[#8a6516] ml-auto shrink-0">
                          {friction === "type-to-confirm" ? "type-to-confirm" : "confirm"}
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] font-medium text-[#141413] line-clamp-2">{cp.title}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {/* DETAIL + sticky verbs */}
      <section className="relative rounded-[10px] border border-[#e8e6dc] bg-white flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center px-10 py-16 text-center">
            <div>
              <CheckCircle2 aria-hidden className="mx-auto h-10 w-10 text-[#cfccc1] mb-3" />
              <p className="text-[13px] text-[#6b6a64] font-serif italic">
                Nothing to review. Checkpoints appear here when an agent proposes an action that needs sign-off.
              </p>
            </div>
          </div>
        ) : (
          <>
            <header className="px-6 py-4 border-b border-[#e8e6dc]">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-[#f0eee6] text-[#6b6a64]">
                  GATE {selected.gate}
                </span>
                <span className="text-[10px] text-[#9a988e] tabular-nums">#{selected.id}</span>
                <span className="text-[10px] text-[#9a988e]">·</span>
                <span className="text-[10px] text-[#9a988e]">
                  blast radius <b className="text-[#141413]">{selected.blastRadius}</b>
                </span>
              </div>
              <h2 className="text-[20px] font-semibold text-[#141413] tracking-tight">{selected.title}</h2>
              {selected.summary && (
                <p className="text-[12px] text-[#6b6a64] font-serif mt-1">{selected.summary}</p>
              )}
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5 pb-32">
              <PayloadDetail payload={selected.payload} />
            </div>

            <div className="sticky bottom-0 left-0 right-0 border-t border-[#e8e6dc] bg-white/95 backdrop-blur px-6 py-3">
              {err && <div className="mb-2 text-[12px] text-[#a33b2b] font-mono">{err}</div>}
              {noteOpenForSelected && (
                <div className="mb-3">
                  <label
                    htmlFor="decision-note"
                    className="block text-[10px] font-bold tracking-wider text-[#9a988e] mb-1"
                  >
                    {noteFor.verb.toUpperCase()} — note for the agent / decision ledger
                  </label>
                  <textarea
                    id="decision-note"
                    ref={noteRef}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="What needs to change, or why this is escalating…"
                    className="w-full rounded-md border border-[#e8e6dc] bg-white px-3 py-2 text-[13px] text-[#141413] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d97757]"
                  />
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-[#9a988e]">
                  {frictionFor(selected.blastRadius) === "none"
                    ? "Low blast radius — one click decides."
                    : "High blast radius — confirmation required."}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {VERBS.map((verb) => (
                    <button
                      key={verb}
                      type="button"
                      disabled={!!busy || (noteOpenForSelected && noteFor.verb === verb && note.trim().length === 0 && verb !== "escalate")}
                      onClick={() => decide(verb)}
                      className={cn(
                        "rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50",
                        VERB_STYLE[verb].cls,
                      )}
                    >
                      {busy === verb
                        ? `${VERB_STYLE[verb].label}…`
                        : noteOpenForSelected && noteFor.verb === verb
                          ? "Send"
                          : VERB_STYLE[verb].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
