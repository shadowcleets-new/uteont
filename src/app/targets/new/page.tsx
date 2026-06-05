import { TargetConfigForm } from "@/components/targets/TargetConfigForm";

export const dynamic = "force-dynamic";

/**
 * Milestone 3 surface — the target-configuration form with inline
 * explanatory tooltips and a live projected-cost meter. Submission is
 * wired in a follow-up that lands alongside the Director-driven target
 * queue (Milestone 6).
 */
export default function NewTargetPage() {
  return (
    <div className="px-9 py-8 max-w-[920px]">
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-1">
        New target
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-8">
        Configure the topic, primary keyword, and the depth dials the
        Research and Ideation agents will use. Hover any{" "}
        <span className="inline-flex items-center align-middle text-[#9a988e]">
          ⓘ
        </span>{" "}
        glyph for context. The Projected Run Cost meter updates live.
      </p>
      <div className="rounded-[10px] border border-[#e8e6dc] bg-white px-6 py-6">
        <TargetConfigForm />
      </div>
    </div>
  );
}
