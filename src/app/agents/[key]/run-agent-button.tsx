"use client";

import { useState } from "react";
import { useActiveSite } from "@/lib/hooks/use-active-site";

interface RunAgentButtonProps {
  agentKey: string;
  disabled: boolean;
}

export function RunAgentButton({ agentKey, disabled }: RunAgentButtonProps) {
  const { activeSiteId, sites } = useActiveSite();
  // Derive the selected site from the active site; once the user picks one
  // explicitly, their override wins. No effect-sync needed.
  const [override, setOverride] = useState<number | "" | null>(null);
  const siteId: number | "" = override ?? activeSiteId ?? "";

  if (disabled) {
    return (
      <button
        disabled
        className="rounded-md bg-[#f3f1ea] text-[#9a988e] px-4 py-2 text-sm font-medium cursor-not-allowed"
      >
        Run agent
      </button>
    );
  }

  return (
    <form action="/api/agents/run-redirect" method="post" className="flex items-center gap-2">
      <input type="hidden" name="agentKey" value={agentKey} />

      <label className="flex items-center gap-1.5">
        <span className="text-[12px] text-[#9a988e]">Site</span>
        <select
          name="siteId"
          className="border border-[#e8e6dc] rounded px-2 py-1 text-sm bg-white text-[#141413]"
          value={siteId}
          onChange={(e) => setOverride(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">— choose a site —</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.key})
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={siteId === ""}
        className="rounded-md bg-[#d97757] text-white px-4 py-2 text-sm font-medium hover:bg-[#c66948] transition-colors disabled:bg-[#f3f1ea] disabled:text-[#9a988e] disabled:cursor-not-allowed"
      >
        Run agent
      </button>
    </form>
  );
}
