export default function SettingsPage() {
  return (
    <div className="px-9 py-8 max-w-[900px]">
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-2">
        Settings
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Configuration UI lands once the database is provisioned. For now,
        runtime configuration lives in environment variables — see{" "}
        <code className="text-[12px]">.env.example</code>.
      </p>

      <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5">
        <ul className="text-[12px] text-[#6b6a64] space-y-2 font-serif">
          <li>
            <strong className="font-sans text-[#141413]">DATABASE_URL</strong>{" "}
            — Neon Postgres connection (managed via Vercel integration)
          </li>
          <li>
            <strong className="font-sans text-[#141413]">
              TELEGRAM_BOT_TOKEN
            </strong>{" "}
            — Set up via @BotFather, then configured here
          </li>
          <li>
            <strong className="font-sans text-[#141413]">
              REDDIT_CLIENT_ID / SECRET
            </strong>{" "}
            — Optional, only for Research Agent&apos;s Reddit source
          </li>
        </ul>
      </div>
    </div>
  );
}
