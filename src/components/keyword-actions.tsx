"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  id: number;
  status: string;
}

export function KeywordActions({ id, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/keywords/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      setError(`${res.status}: ${text.slice(0, 80)}`);
      return;
    }
    startTransition(() => router.refresh());
  }

  if (status === "approved") {
    return <span className="text-[11px] text-[#788c5d]">✓ approved</span>;
  }
  if (status === "shelved") {
    return (
      <button
        disabled={pending}
        onClick={() => patch({ status: "researched", shelvedReason: null })}
        className="text-[11px] text-[#6a9bcc] hover:underline disabled:opacity-50"
      >
        Restore
      </button>
    );
  }
  return (
    <div className="flex gap-2 items-center">
      <button
        disabled={pending}
        onClick={() => patch({ status: "approved" })}
        className="text-[11px] text-[#788c5d] hover:underline disabled:opacity-50 font-medium"
      >
        Approve
      </button>
      <button
        disabled={pending}
        onClick={() => {
          const reason = window.prompt("Reason for shelving (optional)") || "";
          patch({ status: "shelved", shelvedReason: reason || undefined });
        }}
        className="text-[11px] text-[#a33b2b] hover:underline disabled:opacity-50"
      >
        Shelve
      </button>
      {error && (
        <span className="text-[10px] text-[#a33b2b]" title={error}>
          err
        </span>
      )}
    </div>
  );
}
