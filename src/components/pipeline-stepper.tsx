import { Check, CircleDashed, CircleAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PipelineState,
  PipelineStep,
  StepStatus,
} from "@/lib/pipeline/state";

interface AgentPipelineStepperProps {
  state: PipelineState;
  className?: string;
}

const STATUS_BG: Record<StepStatus, string> = {
  pending: "bg-white border-[#e8e6dc] text-[#9a988e]",
  running: "bg-[#fef3eb] border-[#d97757] text-[#d97757] ring-2 ring-[#d97757]/30",
  completed: "bg-[#788c5d] border-[#788c5d] text-white",
  failed: "bg-[#a33b2b] border-[#a33b2b] text-white",
};

const STATUS_LABEL: Record<StepStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Done",
  failed: "Failed",
};

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "completed":
      return <Check className="h-3.5 w-3.5" aria-hidden />;
    case "running":
      return (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      );
    case "failed":
      return <CircleAlert className="h-3.5 w-3.5" aria-hidden />;
    case "pending":
    default:
      return <CircleDashed className="h-3.5 w-3.5" aria-hidden />;
  }
}

function StepCell({ step, idx, total }: { step: PipelineStep; idx: number; total: number }) {
  const last = idx === total - 1;
  return (
    <li className="flex-1 flex items-start min-w-[120px]">
      <div className="flex flex-col items-center flex-1">
        <div
          aria-label={`${step.label}: ${STATUS_LABEL[step.status]}`}
          title={step.detail ?? STATUS_LABEL[step.status]}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors",
            STATUS_BG[step.status],
            step.status === "running" && "animate-pulse",
          )}
        >
          <StepIcon status={step.status} />
        </div>
        <div
          className={cn(
            "mt-2 text-[11px] font-medium text-center",
            step.status === "pending" ? "text-[#9a988e]" : "text-[#141413]",
            step.status === "failed" && "text-[#a33b2b]",
          )}
        >
          {step.label}
        </div>
        {step.detail && (
          <div className="mt-0.5 text-[10px] text-[#6b6a64] font-serif italic text-center max-w-[140px]">
            {step.detail}
          </div>
        )}
      </div>
      {!last && (
        <div
          aria-hidden
          className={cn(
            "flex-1 h-px mt-[14px] mx-1 transition-colors",
            step.status === "completed"
              ? "bg-[#788c5d]"
              : step.status === "failed"
                ? "bg-[#a33b2b]"
                : "bg-[#e8e6dc]",
          )}
        />
      )}
    </li>
  );
}

export function AgentPipelineStepper({
  state,
  className,
}: AgentPipelineStepperProps) {
  return (
    <ol
      aria-label="Agent pipeline progress"
      className={cn(
        "flex items-start gap-1 rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4 overflow-x-auto",
        className,
      )}
    >
      {state.steps.map((s, i) => (
        <StepCell key={s.key} step={s} idx={i} total={state.steps.length} />
      ))}
    </ol>
  );
}
