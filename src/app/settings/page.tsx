import Link from "next/link";

export const dynamic = "force-dynamic";

async function dbReachable(): Promise<boolean> {
  try {
    const { sql } = await import("drizzle-orm");
    const { getDb } = await import("@/lib/db/client");
    await getDb().execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

const isSet = (v?: string) => Boolean(v && v.length > 0);

const LINKS = [
  { href: "/", label: "Dashboard", note: "Agents, runs, objectives" },
  { href: "/targets", label: "Targets", note: "Objectives + trajectory" },
  { href: "/sites", label: "Sites", note: "Profiles + integrations" },
  { href: "/export", label: "Export", note: "Download run outputs" },
];

export default async function SettingsPage() {
  const db = await dbReachable();
  const config: Array<{ label: string; on: boolean; hint: string }> = [
    { label: "Database (DATABASE_URL)", on: isSet(process.env.DATABASE_URL), hint: "Neon Postgres" },
    { label: "Integration encryption (CONNECTION_ENCRYPTION_KEY)", on: isSet(process.env.CONNECTION_ENCRYPTION_KEY), hint: "needed for GSC/GA4/Slack" },
    { label: "Gemini (GEMINI_API_KEY)", on: isSet(process.env.GEMINI_API_KEY), hint: "Director + Content Draft" },
    { label: "Google OAuth — Search Console / GA4 (GOOGLE_OAUTH_CLIENT_ID)", on: isSet(process.env.GOOGLE_OAUTH_CLIENT_ID), hint: "Performance Tracking" },
    { label: "Google sign-in (GOOGLE_CLIENT_ID)", on: isSet(process.env.GOOGLE_CLIENT_ID), hint: "optional login provider" },
    { label: "Telegram bot (TELEGRAM_BOT_TOKEN)", on: isSet(process.env.TELEGRAM_BOT_TOKEN), hint: "alerts + admin" },
    { label: "Cron (CRON_SECRET)", on: isSet(process.env.CRON_SECRET), hint: "daily + weekly jobs" },
    { label: "Worker (WORKER_SHARED_SECRET)", on: isSet(process.env.WORKER_SHARED_SECRET), hint: "generative agents" },
  ];

  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <h1 className="text-[28px] font-semibold text-[#141413] tracking-tight mb-2">Settings</h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-8">
        Operator hub. Configuration is set via environment variables in Vercel — see{" "}
        <code className="text-[12px]">.env.example</code>. The checklist below shows what&apos;s wired
        (booleans only — no secret values are ever shown).
      </p>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4 hover:border-[#d97757] transition-colors"
          >
            <div className="text-[14px] font-semibold text-[#141413]">{l.label}</div>
            <div className="text-[11px] text-[#9a988e] mt-0.5">{l.note}</div>
          </Link>
        ))}
      </section>

      <section className="mb-8">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">SYSTEM</div>
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4 flex items-center gap-3">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ background: db ? "#788c5d" : "#a33b2b" }}
          />
          <span className="text-[13px] text-[#141413] font-medium">Database</span>
          <span className="text-[12px] text-[#6b6a64]">{db ? "connected" : "unreachable"}</span>
        </div>
      </section>

      <section>
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">CONFIGURATION</div>
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-hidden">
          {config.map((c) => (
            <div key={c.label} className="flex items-center gap-3 px-4 py-2.5 border-t border-[#f3f1ea] first:border-t-0">
              <span className="font-bold w-3 shrink-0" style={{ color: c.on ? "#788c5d" : "#cfccc0" }}>
                {c.on ? "✓" : "○"}
              </span>
              <span className="text-[12px] text-[#141413]">{c.label}</span>
              <span className="text-[11px] text-[#9a988e] ml-auto shrink-0">{c.hint}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#9a988e] mt-3 font-serif">
          Unset items (○) mean that feature is built but inert until you add the variable in Vercel.
        </p>
      </section>
    </div>
  );
}
