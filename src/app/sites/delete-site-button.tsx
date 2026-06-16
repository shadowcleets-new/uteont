"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function DeleteSiteButton({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete site "${name}"? It will be removed from the list.`)) return;
        start(async () => {
          const res = await fetch(`/api/sites/${id}`, { method: "DELETE" });
          if (res.ok) router.refresh();
          else alert("Could not delete the site. Try again.");
        });
      }}
      className="underline text-red-700/80 hover:text-red-700 disabled:opacity-50"
    >
      Delete
    </button>
  );
}
