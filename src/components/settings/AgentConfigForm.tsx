"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import type {
  AgentConfig,
  ModelChoice,
} from "@/lib/services/settings";

interface AgentConfigFormProps {
  initial: AgentConfig;
  defaults: AgentConfig;
}

const MODEL_OPTIONS: Array<{ key: ModelChoice; label: string; hint: string }> = [
  { key: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet", hint: "Default. Balanced cost / quality." },
  { key: "claude-3-7-sonnet", label: "Claude 3.7 Sonnet", hint: "Newer Sonnet — better at structured outputs." },
  { key: "claude-3-opus",     label: "Claude 3 Opus",     hint: "Deep reasoning for audits + long-form review." },
  { key: "gemini-3-pro",      label: "Gemini 3 Pro",      hint: "Default for the browser worker. Free via AI Studio." },
  { key: "gemini-3-flash",    label: "Gemini 3 Flash",    hint: "Fast / cheap for testing flows end-to-end." },
];

export function AgentConfigForm({ initial, defaults }: AgentConfigFormProps) {
  const [config, setConfig] = useState<AgentConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  function patch<K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/agent-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { config: AgentConfig };
      setConfig(data.config);
      setSavedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setConfig(defaults);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label className="text-[12px]">
          Max tokens per article run — {config.maxTokensPerRun.toLocaleString()}
        </Label>
        <input
          type="range"
          min={1000}
          max={200000}
          step={1000}
          value={config.maxTokensPerRun}
          onChange={(e) => patch("maxTokensPerRun", Number(e.target.value))}
          className="w-full accent-[#d97757]"
        />
        <div className="flex justify-between text-[10px] text-[#9a988e] tabular-nums">
          <span>1k</span>
          <span>50k</span>
          <span>100k</span>
          <span>200k</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-[12px]">
          Hourly LLM-call rate limit — {config.hourlyRateLimit.toLocaleString()}
        </Label>
        <input
          type="range"
          min={10}
          max={2000}
          step={10}
          value={config.hourlyRateLimit}
          onChange={(e) => patch("hourlyRateLimit", Number(e.target.value))}
          className="w-full accent-[#d97757]"
        />
        <div className="flex justify-between text-[10px] text-[#9a988e] tabular-nums">
          <span>10/h</span>
          <span>500/h</span>
          <span>1000/h</span>
          <span>2000/h</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-[12px]">Default model</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {MODEL_OPTIONS.map((opt) => {
            const selected = config.model === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => patch("model", opt.key)}
                className={cn(
                  "rounded-md border px-3 py-2.5 text-left transition-colors",
                  selected
                    ? "border-[#d97757] bg-[#fef3eb]"
                    : "border-[#e8e6dc] bg-white hover:border-[#cfccc1]",
                )}
              >
                <div className="text-[12px] font-semibold text-[#141413]">
                  {opt.label}
                </div>
                <div className="text-[11px] text-[#6b6a64] font-serif italic">
                  {opt.hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-[12px] text-[#141413]">
        <input
          type="checkbox"
          checked={config.enforceCostGuardrail}
          onChange={(e) => patch("enforceCostGuardrail", e.target.checked)}
          className="accent-[#d97757]"
        />
        Enforce cost guardrail before each run
      </label>

      {error && (
        <div className="rounded-md border border-[#e8c0b8] bg-[#fcf3f1] text-[12px] text-[#a33b2b] px-3 py-2 font-mono">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={reset}
          className="text-[12px] text-[#6b6a64] hover:text-[#141413] underline"
        >
          Reset to defaults
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#d97757] text-white px-4 py-1.5 text-[12px] font-medium hover:bg-[#c66948] disabled:opacity-50 transition-colors"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {saving ? "Saving…" : "Save changes"}
        </button>
        {savedAt && !saving && !error && (
          <span className="text-[10px] text-[#788c5d] font-serif italic">
            saved {savedAt.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
