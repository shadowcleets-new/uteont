import Link from "next/link";

/** Shared empty state for pages that require a selected site. */
export function PickASite() {
  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <p className="text-[13px] text-[#6b6a64] font-serif">
        Select a site from the switcher to see this.{" "}
        <Link href="/sites" className="underline">Manage sites</Link>.
      </p>
    </div>
  );
}
