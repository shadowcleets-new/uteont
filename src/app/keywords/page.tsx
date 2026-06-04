import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { keywords, type Keyword } from "@/lib/db/schema";
import { KeywordsManager } from "@/components/keywords-manager";

export const dynamic = "force-dynamic";

async function fetchKeywords(): Promise<Keyword[]> {
  try {
    const db = getDb();
    return await db.select().from(keywords).orderBy(desc(keywords.priorityRank)).limit(500);
  } catch {
    return [];
  }
}

export default async function KeywordsPage() {
  const rows = await fetchKeywords();

  return (
    <div className="px-9 py-8 max-w-[1200px]">
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-2">Keywords</h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Research Agent output. Filter with the controls, then approve / shelve in bulk — tick rows and use the
        action bar, or act per-row. Shelved keywords can be restored.
      </p>
      <KeywordsManager initial={rows} />
    </div>
  );
}
