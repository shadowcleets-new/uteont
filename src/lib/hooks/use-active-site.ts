"use client";
import { useCallback, useEffect, useState } from "react";

interface Site { id: number; key: string; name: string; domain: string; status: string }

export function useActiveSite() {
  const [activeSiteId, setActiveSiteId] = useState<number | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [active, list] = await Promise.all([
        fetch("/api/ui/active-site").then((r) => r.json()),
        fetch("/api/sites").then((r) => r.json()),
      ]);
      setActiveSiteId(active.siteId);
      setSites(list);
      setLoading(false);
    })();
  }, []);

  const update = useCallback(async (id: number | null) => {
    await fetch("/api/ui/active-site", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: id }),
    });
    setActiveSiteId(id);
  }, []);

  return { activeSiteId, setActiveSiteId: update, sites, loading };
}
