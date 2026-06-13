import { listTactics } from "@/lib/services/tactics";
import { runTacticsScrapeAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tactics — UTEONT" };

const SOURCE_COLORS: Record<string, string> = {
  reddit: "#d97757",
  hn: "#8a6516",
  forum: "#5a7d9a",
  blog: "#788c5d",
  x: "#141413",
  "notebooklm-derived": "#7a5a9a",
  other: "#9a988e",
};

export default async function TacticsPage() {
  const tactics = await listTactics({ limit: 200 }).catch(() => []);

  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <h1 className="text-[28px] font-semibold text-[#141413] tracking-tight mb-2">Tactics</h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Marketing &amp; SEO tactics distilled from communities and NotebookLM. The Director and Idea
        Generation read these during planning, so the pipeline stays grounded in current practice.
      </p>

      {/* Scrape form (LO-62) */}
      <section className="rounded-[10px] border border-[#e8e6dc] bg-white p-5 mb-8">
        <div className="text-[13px] font-semibold text-[#141413] mb-1">Run a scrape</div>
        <p className="text-[11px] text-[#9a988e] mb-3 font-serif">
          Paste source URLs (Reddit / HN / forum / blog / X) — or a video/podcast/Reel URL to extract
          via NotebookLM (zero Gemini API). Leave both blank to scrape the 6 default communities.
        </p>
        <form action={runTacticsScrapeAction} className="flex flex-col gap-3 max-w-[560px]">
          <textarea
            name="sources"
            rows={3}
            placeholder={"https://www.reddit.com/r/SEO/\nhttps://news.ycombinator.com/"}
            className="text-[12px] rounded-[8px] border border-[#e0ddd2] px-3 py-2 font-mono focus:border-[#d97757] focus:outline-none"
          />
          <input
            type="url"
            name="notebooklmUrl"
            placeholder="…or a video/podcast/Reel URL (NotebookLM)"
            className="text-[12px] rounded-[8px] border border-[#e0ddd2] px-3 py-2 focus:border-[#d97757] focus:outline-none"
          />
          <button
            type="submit"
            className="self-start text-[13px] px-4 py-2 rounded-[8px] bg-[#d97757] text-white font-medium hover:bg-[#c96846] transition-colors"
          >
            Run scrape →
          </button>
        </form>
        <p className="text-[11px] text-[#9a988e] mt-3 font-serif">
          The scrape runs on the browser worker; results appear below once it completes.
        </p>
      </section>

      {/* Tactics table */}
      {tactics.length === 0 ? (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
          <p className="text-[12px] text-[#9a988e] italic font-serif">
            No tactics yet — run a scrape above and they&apos;ll land here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tactics.map((t) => (
            <div key={t.id} className="rounded-[10px] border border-[#e8e6dc] bg-white p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full text-white"
                  style={{ background: SOURCE_COLORS[t.sourceType] ?? SOURCE_COLORS.other }}
                >
                  {t.sourceType.toUpperCase()}
                </span>
                {typeof t.score === "number" && (
                  <span className="text-[10px] text-[#9a988e]">▲ {Math.round(t.score)}</span>
                )}
                <a
                  href={t.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-[10px] text-[#9a988e] ml-auto hover:text-[#d97757] truncate max-w-[280px]"
                >
                  {t.sourceUrl}
                </a>
              </div>
              <div className="text-[14px] font-semibold text-[#141413] mb-1">{t.title}</div>
              <p className="text-[12px] text-[#6b6a64] font-serif line-clamp-3">{t.body}</p>
              {Array.isArray(t.tags) && t.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {t.tags.map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[#f0eee6] text-[#6b6a64]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
