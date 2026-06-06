import { CircleCheck, CircleAlert } from "lucide-react";
import {
  getAgentConfig,
  DEFAULT_AGENT_CONFIG,
  listProviderKeys,
} from "@/lib/services/settings";
import { AgentConfigForm } from "@/components/settings/AgentConfigForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [config, providers] = await Promise.all([
    getAgentConfig(),
    Promise.resolve(listProviderKeys()),
  ]);

  return (
    <div className="px-9 py-8 max-w-[960px]">
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-1">
        Settings
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Workspace-wide configuration. Provider keys come from the deploy
        environment; agent-level controls are persisted to the database
        and apply immediately on save.
      </p>

      <section
        aria-labelledby="settings-providers"
        className="rounded-[10px] border border-[#e8e6dc] bg-white px-6 py-5 mb-6"
      >
        <div id="settings-providers" className="flex items-baseline justify-between gap-2 mb-1">
          <h2 className="text-[14px] font-semibold text-[#141413]">
            API Integration & Billing
          </h2>
          <span className="text-[10px] font-bold tracking-wider text-[#9a988e]">
            CATEGORY A
          </span>
        </div>
        <p className="text-[12px] text-[#6b6a64] font-serif mb-4">
          Provider keys mounted from the deployment environment. Update via{" "}
          <code className="text-[11px] bg-[#f3f1ea] rounded px-1 py-0.5">vercel env</code>{" "}
          or <code className="text-[11px] bg-[#f3f1ea] rounded px-1 py-0.5">.env.local</code>, then redeploy.
        </p>
        <ul className="divide-y divide-[#f3f1ea]">
          {providers.map((p) => (
            <li key={p.key} className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-start gap-3">
                {p.present ? (
                  <CircleCheck
                    aria-hidden
                    className="h-4 w-4 mt-0.5 text-[#788c5d]"
                  />
                ) : (
                  <CircleAlert
                    aria-hidden
                    className="h-4 w-4 mt-0.5 text-[#a33b2b]"
                  />
                )}
                <div>
                  <div className="text-[13px] font-medium text-[#141413]">
                    {p.label}
                  </div>
                  <div className="text-[11px] text-[#9a988e] font-serif italic">
                    {p.hint}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <code className="text-[10px] text-[#6b6a64] font-mono">
                  {p.key}
                </code>
                <div className="text-[10px] uppercase tracking-wider mt-0.5"
                     style={{ color: p.present ? "#788c5d" : "#a33b2b" }}>
                  {p.present ? "configured" : "missing"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="settings-agent"
        className="rounded-[10px] border border-[#e8e6dc] bg-white px-6 py-5"
      >
        <div id="settings-agent" className="flex items-baseline justify-between gap-2 mb-1">
          <h2 className="text-[14px] font-semibold text-[#141413]">
            Agent Configuration
          </h2>
          <span className="text-[10px] font-bold tracking-wider text-[#9a988e]">
            CATEGORY B
          </span>
        </div>
        <p className="text-[12px] text-[#6b6a64] font-serif mb-4">
          Tunes how aggressively the multi-agent pipeline spends tokens,
          which model it defaults to, and whether the projected-cost
          guardrail (Milestone 3) halts runs that exceed the ceiling.
        </p>
        <AgentConfigForm initial={config} defaults={DEFAULT_AGENT_CONFIG} />
      </section>
    </div>
  );
}
