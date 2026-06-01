"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveSite } from "@/lib/hooks/use-active-site";

type Kind = "phase" | "result" | "failed" | "done";
interface Line {
  text: string;
  kind: Kind;
}

const COLOR: Record<Kind, string> = {
  phase: "#6b6a64",
  result: "#4a6b2f",
  failed: "#a33b2b",
  done: "#788c5d",
};

/** Live (SSE) run with a streaming log + ticking elapsed clock. */
export function AgentStream({ agentKey }: { agentKey: string }) {
  const { activeSiteId } = useActiveSite();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const stop = () => {
    esRef.current?.close();
    esRef.current = null;
    setRunning(false);
    router.refresh();
  };

  const start = () => {
    if (running) return;
    if (!activeSiteId) {
      setLines([{ text: "Select a site (top-left) first.", kind: "failed" }]);
      return;
    }
    setLines([]);
    setScore(null);
    setElapsed(0);
    setRunning(true);

    const es = new EventSource(`/api/agents/${agentKey}/stream?siteId=${activeSiteId}`);
    esRef.current = es;
    const push = (text: string, kind: Kind) => setLines((l) => [...l, { text, kind }]);

    es.addEventListener("phase", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      push(d.label, "phase");
      if (typeof d.elapsedMs === "number") setElapsed(d.elapsedMs);
    });
    es.addEventListener("tick", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      if (typeof d.elapsedMs === "number") setElapsed(d.elapsedMs);
    });
    es.addEventListener("result", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      if (typeof d.score === "number") setScore(d.score);
      push(typeof d.score === "number" ? `Result — score ${d.score}` : "Result received", "result");
      if (typeof d.elapsedMs === "number") setElapsed(d.elapsedMs);
    });
    es.addEventListener("failed", (e) => {
      let msg = "stream error";
      try {
        msg = JSON.parse((e as MessageEvent).data).message;
      } catch {
        /* keep default */
      }
      push(msg, "failed");
      stop();
    });
    es.addEventListener("done", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      push(d.queued ? "Queued for the worker." : "Done.", "done");
      if (typeof d.elapsedMs === "number") setElapsed(d.elapsedMs);
      stop();
    });
    // Native transport error (e.g. server closed) — only matters if still running.
    es.onerror = () => {
      if (esRef.current) stop();
    };
  };

  return (
    <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-4 mb-6">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={start}
          disabled={running}
          className="rounded-md bg-[#141413] text-white px-3 py-1.5 text-[12px] font-medium hover:bg-black disabled:bg-[#f3f1ea] disabled:text-[#9a988e] transition-colors"
        >
          {running ? "Running…" : "Run live ▸"}
        </button>
        <span className="text-[12px] text-[#6b6a64] tabular-nums">{(elapsed / 1000).toFixed(1)}s</span>
        {score !== null && (
          <span className="ml-auto text-[12px] font-semibold text-[#141413]">score {score}</span>
        )}
      </div>
      {lines.length > 0 && (
        <div className="rounded-[8px] bg-[#faf9f5] border border-[#f0eee6] p-3 font-mono text-[11px] leading-relaxed max-h-[180px] overflow-auto">
          {lines.map((l, i) => (
            <div key={i} style={{ color: COLOR[l.kind] }}>
              <span className="text-[#cfccc0]">{running || i < lines.length ? "›" : "›"}</span> {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
