import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { kvSettings } from "@/lib/db/schema";

export type ModelChoice =
  | "claude-3-5-sonnet"
  | "claude-3-7-sonnet"
  | "claude-3-opus"
  | "gemini-3-pro"
  | "gemini-3-flash";

export interface AgentConfig {
  /** Tokens per article run; the cost-projection bar is calibrated here. */
  maxTokensPerRun: number;
  /** Worker-wide hourly rate limit for outbound LLM calls. */
  hourlyRateLimit: number;
  /** Model picker. Persisted as text so additions are zero-migration. */
  model: ModelChoice;
  /** Toggle aggressive cost-tier guardrail before each run. */
  enforceCostGuardrail: boolean;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxTokensPerRun: 25000,
  hourlyRateLimit: 200,
  model: "claude-3-5-sonnet",
  enforceCostGuardrail: true,
};

const KEY = "agent.config";

export async function getAgentConfig(): Promise<AgentConfig> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(kvSettings)
      .where(eq(kvSettings.key, KEY))
      .limit(1);
    if (!row) return DEFAULT_AGENT_CONFIG;
    return { ...DEFAULT_AGENT_CONFIG, ...(row.value as Partial<AgentConfig>) };
  } catch (e) {
    console.warn("[settings.getAgentConfig] DB error:", e);
    return DEFAULT_AGENT_CONFIG;
  }
}

export async function setAgentConfig(patch: Partial<AgentConfig>): Promise<AgentConfig> {
  const next = { ...(await getAgentConfig()), ...patch };
  const db = getDb();
  const existing = await db
    .select()
    .from(kvSettings)
    .where(eq(kvSettings.key, KEY))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(kvSettings)
      .set({ value: next, updatedAt: new Date() })
      .where(eq(kvSettings.key, KEY));
  } else {
    await db.insert(kvSettings).values({ key: KEY, value: next });
  }
  return next;
}

/**
 * Surfaces presence of each API-key env var without leaking the actual
 * values. The settings UI calls this to render the green/red dots.
 */
export interface ProviderKeyStatus {
  key: string;
  label: string;
  present: boolean;
  hint: string;
}

export function listProviderKeys(): ProviderKeyStatus[] {
  return [
    {
      key: "GEMINI_API_KEY",
      label: "Gemini",
      present: Boolean(process.env.GEMINI_API_KEY),
      hint: "Required for AI Studio drafting + research tools",
    },
    {
      key: "DATABASE_URL",
      label: "Neon Postgres",
      present: Boolean(process.env.DATABASE_URL),
      hint: "Primary application database",
    },
    {
      key: "WORKER_SHARED_SECRET",
      label: "Worker bearer",
      present: Boolean(process.env.WORKER_SHARED_SECRET),
      hint: "Authenticates the browser worker to /api/jobs/*",
    },
    {
      key: "CRON_SECRET",
      label: "Cron secret",
      present: Boolean(process.env.CRON_SECRET),
      hint: "Authenticates Vercel cron triggers",
    },
    {
      key: "TELEGRAM_BOT_TOKEN",
      label: "Telegram bot",
      present: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      hint: "Inline-keyboard approvals + digest delivery",
    },
    {
      key: "GOOGLE_CLIENT_ID",
      label: "Google OAuth",
      present: Boolean(process.env.GOOGLE_CLIENT_ID),
      hint: "Optional sign-in provider",
    },
  ];
}
